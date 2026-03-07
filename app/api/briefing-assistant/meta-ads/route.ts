import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { searchMetaAdLibrary, normalizeMetaAd, isMetaAdLibraryAvailable, MetaTokenError } from '@/src/integrations/meta/client'
import type { NormalizedMetaAd } from '@/src/integrations/meta/client'
import { buildScoringPrompt, computeOverallScore, RUBRIC_VERSION } from '@/src/domain/briefingAssistant/scoring/rubric'
import {
  computeHeuristicGate,
  computeDaysRunning,
  buildSemanticTaggingPrompt,
  parseSemanticResponse,
  computeQualityScore,
  type AdForTagging,
} from '@/src/domain/briefingAssistant/scoring/semanticTagger'
import { embedAdCreative, upsertAdEmbedding, isAdMemoryAvailable } from '@/lib/adCreativeMemory'
import { indexAdInGraph } from '@/lib/adGraphClient'
import { extractMediaFromSnapshot } from '@/src/integrations/meta/preview'
import { mirrorMediaAsset } from '@/src/integrations/meta/mediaMirror'
import { scrapeMetaAdsLibrary } from '@/src/integrations/meta/browserScraper'
import { scrapeViaApify, isApifyAvailable } from '@/src/integrations/apify/metaAdsScraper'

export const dynamic = 'force-dynamic'

type SourceMode = 'apify' | 'browser' | 'api' | 'auto'
type BrowseSurface = 'discovery' | 'top_picks' | 'following' | 'saved'

type SupabaseDb = NonNullable<ReturnType<typeof getSupabase>>

// ---------------------------------------------------------------------------
// In-process browse cache (SWR pattern)
// ---------------------------------------------------------------------------

const browseCache = new Map<string, { data: unknown; ts: number }>()
const BROWSE_CACHE_TTL_MS = 30_000

function getCached(key: string): unknown | null {
  const entry = browseCache.get(key)
  if (!entry) return null
  if (Date.now() - entry.ts > BROWSE_CACHE_TTL_MS) {
    browseCache.delete(key)
    return null
  }
  return entry.data
}

function setCache(key: string, data: unknown) {
  browseCache.set(key, { data, ts: Date.now() })
  if (browseCache.size > 200) {
    const oldest = [...browseCache.entries()].sort((a, b) => a[1].ts - b[1].ts)
    for (let i = 0; i < 50; i++) browseCache.delete(oldest[i][0])
  }
}

function getSourceMode(): SourceMode {
  const env = process.env.META_ADS_SOURCE_MODE?.toLowerCase()
  if (env === 'apify') return 'apify'
  if (env === 'api') return 'api'
  if (env === 'browser') return 'browser'
  return 'auto'
}

function isValidMediaUrl(url: string | null): boolean {
  if (!url) return false
  if (url.startsWith('data:')) return false
  if (url.startsWith('/api/')) return false
  if (url.includes('/ads/archive/render_ad/')) return false
  if (url.includes('/ads/library/?id=')) return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'https:' || parsed.protocol === 'http:'
  } catch {
    return false
  }
}

function thumbnailStatus(url: string | null): 'ready' | 'pending' | 'invalid' {
  if (!url) return 'pending'
  if (isValidMediaUrl(url)) return 'ready'
  return 'invalid'
}

/**
 * GET /api/briefing-assistant/meta-ads
 *
 * Query params:
 *   surface           — 'discovery' | 'top_picks' | 'following' | 'saved' (default: 'discovery')
 *   tab               — legacy alias for surface (maps use-cases/trending -> discovery)
 *   quality           — 'approved' (default for discovery) | 'all' | 'rejected' | 'manual_pick'
 *   q                 — text search across body_text, page_name, title
 *   content_style     — comma-separated content style tags
 *   target_market     — 'b2b' | 'b2c'
 *   language          — language filter
 *   format            — 'image' | 'video'
 *   active            — 'true' to show only active ads
 *   min_days_running  — minimum days running threshold
 *   sort              — 'longest_running' (default) | 'newest' | 'score' | 'quality'
 *   limit             — max results (default 50, max 200)
 *   check=health      — lightweight diagnostics
 *   followed_page_ids — comma-separated page IDs for Following surface
 *   user_id           — for Saved surface
 */
export async function GET(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)

  if (searchParams.get('check') === 'health') {
    return handleHealthCheck(db)
  }

  const cacheKey = searchParams.toString()
  const cached = getCached(cacheKey)
  if (cached) return NextResponse.json(cached)

  const legacyTab = searchParams.get('tab')
  let surface: BrowseSurface = 'discovery'
  if (searchParams.get('surface')) {
    surface = searchParams.get('surface') as BrowseSurface
  } else if (legacyTab === 'following') {
    surface = 'following'
  }

  const qualityFilter = searchParams.get('quality') || (surface === 'discovery' ? 'approved' : 'all')
  const q = searchParams.get('q')?.trim() || null
  const contentStyleFilter = searchParams.get('content_style')?.split(',').filter(Boolean) || []
  const targetMarketFilter = searchParams.get('target_market') || null
  const languageFilter = searchParams.get('language') || null
  const formatFilter = searchParams.get('format') || null
  const activeOnly = searchParams.get('active') === 'true'
  const minDaysRunning = searchParams.get('min_days_running') ? Number(searchParams.get('min_days_running')) : null
  const sort = searchParams.get('sort') || 'longest_running'
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)
  const followedPageIds = searchParams.get('followed_page_ids')?.split(',').filter(Boolean) || []
  const userId = searchParams.get('user_id') || null

  const selectFields = `
    id, source_type, external_id, page_id, title, preview, thumbnail_url, creative_url,
    body_text, link_url, media_type, platform, page_name, is_active,
    started_at, ended_at, spend_lower, spend_upper, impressions_lower, impressions_upper,
    tags, created_at, updated_at,
    quality_status, quality_score, quality_summary,
    content_style_tags, hook_type, proof_type, creator_style, target_market,
    ai_slop_risk, days_running, language, is_top_pick, source_provider
  `

  let query = db
    .from('briefing_source_items')
    .select(selectFields)
    .eq('source_type', 'meta_ad')

  if (surface === 'following') {
    if (followedPageIds.length > 0) {
      query = query.in('page_id', followedPageIds)
    } else {
      const payload = { ads: [], watchlist_status: null, surface }
      return NextResponse.json(payload)
    }
  }

  if (surface === 'top_picks') {
    query = query.or('is_top_pick.eq.true,quality_score.gte.80')
  }

  if (surface === 'saved' && userId) {
    const { data: savedItems } = await db
      .from('briefing_saved_items')
      .select('source_item_id')
      .eq('user_id', userId)
      .limit(limit)
    const savedIds = (savedItems ?? []).map((s: { source_item_id: string }) => s.source_item_id)
    if (savedIds.length === 0) {
      const payload = { ads: [], watchlist_status: null, surface }
      return NextResponse.json(payload)
    }
    query = query.in('id', savedIds)
  }

  if (qualityFilter === 'approved') query = query.eq('quality_status', 'approved')
  else if (qualityFilter === 'rejected') query = query.eq('quality_status', 'rejected')
  else if (qualityFilter === 'manual_pick') query = query.eq('quality_status', 'manual_pick')

  if (contentStyleFilter.length > 0) {
    query = query.overlaps('content_style_tags', contentStyleFilter)
  }
  if (targetMarketFilter) query = query.eq('target_market', targetMarketFilter)
  if (languageFilter) query = query.eq('language', languageFilter)
  if (formatFilter) query = query.eq('media_type', formatFilter)
  if (activeOnly) query = query.eq('is_active', true)
  if (minDaysRunning != null) query = query.gte('days_running', minDaysRunning)

  if (q) {
    query = query.or(`body_text.ilike.%${q}%,page_name.ilike.%${q}%,title.ilike.%${q}%`)
  }

  if (sort === 'quality') {
    query = query.order('quality_score', { ascending: false, nullsFirst: false })
  } else if (sort === 'score') {
    query = query.order('quality_score', { ascending: false, nullsFirst: false })
  } else if (sort === 'longest_running') {
    query = query.order('days_running', { ascending: false, nullsFirst: false })
  } else {
    query = query.order('started_at', { ascending: false })
  }

  query = query.limit(limit)

  const { data: items, error: dbErr } = await query
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  const itemIds = (items ?? []).map((i: { id: string }) => i.id)
  const scoreMap = new Map<string, { score_hook: number | null; score_overall: number | null }>()

  if (itemIds.length > 0) {
    const { data: scores } = await db
      .from('briefing_analysis_scores')
      .select('source_item_id, score_hook, score_overall')
      .in('source_item_id', itemIds)
    for (const s of scores ?? []) {
      scoreMap.set(s.source_item_id, { score_hook: s.score_hook, score_overall: s.score_overall })
    }
  }

  const ads = (items ?? []).map((item: Record<string, unknown>) => {
    const scores = scoreMap.get(item.id as string)
    const rawThumb = item.thumbnail_url as string | null
    const rawCreative = item.creative_url as string | null
    const fallbackPreview = `/api/briefing-assistant/meta-ads/${item.id}/preview`
    const thumb = isValidMediaUrl(rawThumb) ? rawThumb! : fallbackPreview
    const creative = isValidMediaUrl(rawCreative) ? rawCreative! : (isValidMediaUrl(rawThumb) ? rawThumb! : fallbackPreview)
    const status = thumbnailStatus(rawThumb)
    return {
      id: item.id,
      ad_id: item.external_id,
      page_id: item.page_id ?? null,
      page_name: item.page_name ?? item.title,
      creative_url: creative,
      thumbnail_url: thumb,
      thumbnail_status: status,
      media_type: item.media_type ?? 'image',
      body_text: item.body_text,
      link_url: (item.link_url as string | null) || `/api/briefing-assistant/meta-ads/${item.id}/snapshot`,
      started_at: item.started_at,
      ended_at: item.ended_at,
      is_active: item.is_active ?? false,
      platform: item.platform ?? 'meta',
      spend_lower: item.spend_lower,
      spend_upper: item.spend_upper,
      impressions_lower: item.impressions_lower,
      impressions_upper: item.impressions_upper,
      score_hook: scores?.score_hook ?? null,
      score_overall: scores?.score_overall ?? null,
      tags: item.tags ?? [],
      quality_status: item.quality_status ?? 'pending',
      quality_score: item.quality_score ?? null,
      quality_summary: item.quality_summary ?? null,
      content_style_tags: item.content_style_tags ?? [],
      hook_type: item.hook_type ?? null,
      proof_type: item.proof_type ?? null,
      creator_style: item.creator_style ?? null,
      target_market: item.target_market ?? null,
      days_running: item.days_running ?? null,
      language: item.language ?? null,
      is_top_pick: item.is_top_pick ?? false,
      source_provider: item.source_provider ?? null,
    }
  })

  let watchlistStatus: { token_ok: boolean | null; last_synced: string | null } | null = null
  try {
    const { data: wl } = await db
      .from('meta_ads_watchlist')
      .select('last_success_at, last_error')
      .eq('enabled', true)
      .order('last_success_at', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle()
    watchlistStatus = {
      token_ok: isMetaAdLibraryAvailable() ? null : false,
      last_synced: (wl?.last_success_at as string) ?? null,
    }
  } catch { /* watchlist table may not exist yet */ }

  if (ads.length === 0 && surface === 'discovery') {
    triggerWatchlistSync(db).catch(() => {})
  }

  const payload = { ads, watchlist_status: watchlistStatus, surface }
  setCache(cacheKey, payload)
  return NextResponse.json(payload)
}

let _watchlistSyncRunning = false

async function triggerWatchlistSync(db: SupabaseDb) {
  if (_watchlistSyncRunning) return
  _watchlistSyncRunning = true
  const mode = getSourceMode()
  try {
    const { data: entries } = await db
      .from('meta_ads_watchlist')
      .select('id, search_term, page_id, region_code')
      .eq('enabled', true)
      .limit(10)

    for (const entry of entries ?? []) {
      try {
        const region = entry.region_code || 'US'
        let ads: NormalizedMetaAd[] = []

        const searchTerms = entry.search_term || undefined
        const pageIds = entry.page_id ? [entry.page_id] : undefined

        if (mode === 'apify' && isApifyAvailable()) {
          const result = await scrapeViaApify({ search_terms: searchTerms, search_page_ids: pageIds, country: region, limit: 25 })
          ads = result.ads
        } else if (mode === 'api' && isMetaAdLibraryAvailable()) {
          const result = await searchMetaAdLibrary({ search_terms: searchTerms, search_page_ids: pageIds, ad_reached_countries: [region], limit: 25 })
          ads = result.data.map((ad) => normalizeMetaAd(ad))
        } else {
          if (isApifyAvailable()) {
            const result = await scrapeViaApify({ search_terms: searchTerms, search_page_ids: pageIds, country: region, limit: 25 })
            ads = result.ads
          } else {
            const result = await scrapeMetaAdsLibrary({ search_terms: searchTerms, search_page_ids: pageIds, country: region, limit: 25 })
            ads = result.ads
          }
          if (ads.length === 0 && isMetaAdLibraryAvailable()) {
            const apiResult = await searchMetaAdLibrary({ search_terms: searchTerms, search_page_ids: pageIds, ad_reached_countries: [region], limit: 25 })
            ads = apiResult.data.map((ad) => normalizeMetaAd(ad))
          }
        }

        const ingestedIds = await upsertNormalizedAds(db, ads, {
          watchlist_id: entry.id,
          source_query: entry.search_term || entry.page_id,
        })

        await db
          .from('meta_ads_watchlist')
          .update({ last_synced_at: new Date().toISOString(), last_success_at: new Date().toISOString(), last_error: null })
          .eq('id', entry.id)

        if (ingestedIds.length > 0) {
          runThumbnailWarmup(db, ingestedIds).catch(console.error)
        }
      } catch (e) {
        await db
          .from('meta_ads_watchlist')
          .update({ last_synced_at: new Date().toISOString(), last_error: e instanceof Error ? e.message : 'Unknown error' })
          .eq('id', entry.id)
          .then(() => {})
          .catch(() => {})
      }
    }
  } finally {
    _watchlistSyncRunning = false
  }
}

// ---------------------------------------------------------------------------
// Shared: convert NormalizedMetaAd[] to DB row shape + upsert
// ---------------------------------------------------------------------------

function normalizedToRow(n: NormalizedMetaAd, extra?: Record<string, unknown>) {
  const daysRunning = computeDaysRunning(n.started_at, n.ended_at)

  const row: Record<string, unknown> = {
    source_type: 'meta_ad' as const,
    external_id: n.external_id,
    page_id: n.page_id,
    title: n.title,
    preview: n.preview,
    page_name: n.page_name,
    body_text: n.body_text,
    link_url: n.link_url,
    media_type: n.media_type,
    platform: n.platform,
    is_active: n.is_active,
    started_at: n.started_at,
    ended_at: n.ended_at,
    spend_lower: n.spend_lower,
    spend_upper: n.spend_upper,
    impressions_lower: n.impressions_lower,
    impressions_upper: n.impressions_upper,
    raw_data: n.raw_data,
    days_running: daysRunning,
    language: n.language ?? null,
    cta_text: n.cta_text ?? null,
    collation_count: n.collation_count ?? null,
    source_provider: n.source_provider ?? null,
    ...extra,
  }
  if (n.thumbnail_url) row.thumbnail_url = n.thumbnail_url
  if (n.creative_url) row.creative_url = n.creative_url
  return row
}

async function upsertNormalizedAds(
  db: SupabaseDb,
  ads: NormalizedMetaAd[],
  extra?: Record<string, unknown>,
): Promise<string[]> {
  const rows = ads.map((n) => normalizedToRow(n, extra))
  const ingestedIds: string[] = []
  const BATCH_SIZE = 20
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE)
    const { data: upserted, error: upsertErr } = await db
      .from('briefing_source_items')
      .upsert(batch, { onConflict: 'source_type,external_id' })
      .select('id')
    if (!upsertErr && upserted) {
      for (const row of upserted) {
        if (row.id) ingestedIds.push(row.id)
      }
    }
  }
  return ingestedIds
}

// ---------------------------------------------------------------------------
// Provider dispatch: apify > browser > api fallback chain
// ---------------------------------------------------------------------------

async function syncViaApify(params: {
  search_terms?: string
  page_ids?: string[]
  country?: string
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await scrapeViaApify({
    search_terms: params.search_terms,
    search_page_ids: params.page_ids,
    country: params.country ?? 'US',
    limit: params.limit,
  })
  return { ads: result.ads, provider: 'apify', errors: result.errors }
}

async function syncViaBrowser(params: {
  search_terms?: string
  page_ids?: string[]
  country?: string
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await scrapeMetaAdsLibrary({
    search_terms: params.search_terms,
    search_page_ids: params.page_ids,
    country: params.country ?? 'US',
    limit: params.limit,
  })
  return { ads: result.ads, provider: 'browser', errors: result.errors }
}

async function syncViaApi(params: {
  search_terms?: string
  page_ids?: string[]
  countries?: string[]
  limit?: number
}): Promise<{ ads: NormalizedMetaAd[]; provider: string; errors: string[] }> {
  const result = await searchMetaAdLibrary({
    search_terms: params.search_terms?.trim(),
    search_page_ids: params.page_ids,
    ad_reached_countries: params.countries ?? ['US'],
    limit: Math.min(params.limit ?? 50, 100),
  })
  const ads = result.data.map((ad) => normalizeMetaAd(ad))
  return { ads, provider: 'api', errors: [] }
}

/**
 * POST /api/briefing-assistant/meta-ads
 *
 * Actions:
 *   ?action=warm-thumbnails   — re-extract media for ads missing thumbnails (bounded)
 *   ?action=promote-video     — mirror a specific video to storage
 *   ?action=cleanup-media     — expire stale competitor media
 *   ?action=sync-watchlist    — background watchlist sync
 *   ?action=mirror-media      — on-demand media mirror for a specific ad
 *   (default)                 — sync ads (browser-primary, API fallback)
 *
 * Sync body: { search_terms, page_ids?, countries?, country?, limit?, source_mode? }
 */
export async function POST(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'warm-thumbnails') {
    return handleWarmThumbnails(db)
  }

  if (action === 'promote-video') {
    const body = await req.json().catch(() => ({}))
    const itemId = (body as { item_id?: string }).item_id
    if (!itemId) {
      return NextResponse.json({ error: 'item_id required' }, { status: 400 })
    }
    return handlePromoteVideo(db, itemId)
  }

  if (action === 'cleanup-media') {
    return handleCleanupMedia(db)
  }

  if (action === 'sync-watchlist') {
    triggerWatchlistSync(db).catch(console.error)
    return NextResponse.json({ ok: true, message: 'Watchlist sync triggered in background' })
  }

  if (action === 'mirror-media') {
    const body = await req.json().catch(() => ({}))
    return handleMirrorMedia(db, body as { item_id?: string; type?: string })
  }

  if (action === 'manual-pick') {
    const body = await req.json().catch(() => ({}))
    return handleManualPick(db, body as { item_id?: string; picked_by?: string; reason?: string; remove?: boolean })
  }

  if (action === 'run-quality-pass') {
    runSemanticQualityPass(db).catch(console.error)
    return NextResponse.json({ ok: true, message: 'Semantic quality pass triggered in background' })
  }

  const body = await req.json().catch(() => ({}))
  const {
    search_terms,
    page_ids,
    countries = ['US', 'GB', 'NL', 'BE', 'DE', 'AU'],
    country,
    limit = 50,
    source_mode,
  } = body as {
    search_terms?: string
    page_ids?: string[]
    countries?: string[]
    country?: string
    limit?: number
    source_mode?: SourceMode
  }

  if (!search_terms?.trim() && !page_ids?.length) {
    return NextResponse.json(
      { error: 'Provide search_terms or page_ids to sync ads from Meta.' },
      { status: 400 },
    )
  }

  const mode = source_mode ?? getSourceMode()

  try {
    let result: { ads: NormalizedMetaAd[]; provider: string; errors: string[] }

    if (mode === 'apify' && isApifyAvailable()) {
      result = await syncViaApify({ search_terms, page_ids, country: country ?? countries[0], limit })
    } else if (mode === 'api' && isMetaAdLibraryAvailable()) {
      result = await syncViaApi({ search_terms, page_ids, countries, limit })
    } else if (mode === 'browser') {
      result = await syncViaBrowser({ search_terms, page_ids, country: country ?? countries[0], limit })
    } else {
      // auto: prefer apify > browser > api
      if (isApifyAvailable()) {
        result = await syncViaApify({ search_terms, page_ids, country: country ?? countries[0], limit })
      } else {
        result = await syncViaBrowser({ search_terms, page_ids, country: country ?? countries[0], limit })
      }
      if (result.ads.length === 0 && isMetaAdLibraryAvailable()) {
        console.log(`[meta-sync] ${result.provider} returned 0 ads, falling back to API`)
        result = await syncViaApi({ search_terms, page_ids, countries, limit })
        result.provider = 'api_fallback'
      }
    }

    const ingestedIds = await upsertNormalizedAds(db, result.ads)

    runAutoAnalysis(db, ingestedIds).catch(console.error)
    runSemanticQualityPassForIds(db, ingestedIds).catch(console.error)
    runThumbnailWarmup(db, ingestedIds).catch(console.error)

    return NextResponse.json({
      ok: true,
      fetched: result.ads.length,
      ingested: ingestedIds.length,
      ingested_ids: ingestedIds,
      provider: result.provider,
      errors: result.errors.length > 0 ? result.errors : undefined,
    })
  } catch (e) {
    if (e instanceof MetaTokenError) {
      return NextResponse.json(
        { error: e.message, token_expired: true },
        { status: 401 },
      )
    }
    const message = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/**
 * Fire-and-forget: score each newly ingested ad using the rubric.
 * Runs in background so the sync response returns quickly.
 */
async function runAutoAnalysis(
  db: NonNullable<ReturnType<typeof getSupabase>>,
  itemIds: string[],
) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || itemIds.length === 0) return

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  for (const itemId of itemIds.slice(0, 10)) {
    try {
      const { data: item } = await db
        .from('briefing_source_items')
        .select('title, body_text, page_name, media_type, platform, tags')
        .eq('id', itemId)
        .single()
      if (!item) continue

      const parts: string[] = []
      if (item.page_name) parts.push(`Brand: ${item.page_name}`)
      if (item.platform) parts.push(`Platform: ${item.platform}`)
      if (item.media_type) parts.push(`Format: ${item.media_type}`)
      if (item.body_text) parts.push(`Ad copy: ${item.body_text}`)
      if (item.tags?.length) parts.push(`Tags: ${item.tags.join(', ')}`)
      const adDescription = parts.join('\n')

      const prompt = buildScoringPrompt(adDescription)
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : ''
      let jsonStr = rawText
      const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeMatch) jsonStr = codeMatch[1].trim()

      const parsed = JSON.parse(jsonStr) as Record<string, unknown>
      const clamp = (v: unknown) => {
        const n = typeof v === 'number' ? v : Number(v)
        return isNaN(n) ? 50 : Math.max(0, Math.min(100, Math.round(n)))
      }
      const scores = {
        hook: clamp(parsed.hook),
        attention: clamp(parsed.attention),
        clarity: clamp(parsed.clarity),
        cta: clamp(parsed.cta),
      }

      await db.from('briefing_analysis_scores').upsert(
        {
          source_item_id: itemId,
          score_hook: scores.hook,
          score_attention: scores.attention,
          score_clarity: scores.clarity,
          score_cta: scores.cta,
          score_overall: computeOverallScore(scores),
          analysis_summary: (parsed.summary as string) ?? null,
          rubric_version: RUBRIC_VERSION,
          model_used: 'claude-sonnet-4-20250514',
          raw_response: parsed,
        },
        { onConflict: 'source_item_id,rubric_version' },
      )
    } catch (e) {
      console.error(`[auto-analysis] Failed for ${itemId}:`, e instanceof Error ? e.message : e)
    }
  }
}

// ---------------------------------------------------------------------------
// Health check: token status + thumbnail coverage
// ---------------------------------------------------------------------------

async function handleHealthCheck(db: SupabaseDb) {
  const tokenConfigured = isMetaAdLibraryAvailable()

  let tokenValid: boolean | null = null
  if (tokenConfigured) {
    try {
      await searchMetaAdLibrary({
        search_terms: 'test',
        ad_reached_countries: ['US'],
        limit: 1,
      })
      tokenValid = true
    } catch (e) {
      tokenValid = e instanceof MetaTokenError ? false : null
    }
  }

  const { count: totalAds } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')

  const { count: withMirroredPoster } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .like('thumbnail_url', '%supabase%')

  const { count: withAnyThumb } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .not('thumbnail_url', 'is', null)
    .not('thumbnail_url', 'like', 'data:%')
    .not('thumbnail_url', 'like', '%render_ad%')

  const { count: withMirroredVideo } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .like('creative_url', '%supabase%')

  const { count: videoDetected } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('media_type', 'video')

  const { count: fallbackPreview } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .or('thumbnail_url.is.null,thumbnail_url.like.%render_ad%,thumbnail_url.like.data:%')

  const total = totalAds ?? 0

  const { count: browserSourced } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .filter('raw_data->>_source', 'eq', 'browser_scrape')

  const { count: withDirectThumb } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .not('thumbnail_url', 'is', null)
    .like('thumbnail_url', 'http%')
    .not('thumbnail_url', 'like', '%render_ad%')
    .not('thumbnail_url', 'like', '%supabase%')

  const sourceMode = getSourceMode()
  const defaultRegion = process.env.META_ADS_DEFAULT_REGION || 'US'
  const proxyConfigured = !!process.env.META_ADS_PROXY_URL
  const apifyAvailable = isApifyAvailable()

  const { count: qualityApproved } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('quality_status', 'approved')

  const { count: qualityRejected } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('quality_status', 'rejected')

  const { count: qualityPending } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('quality_status', 'pending')

  const { count: topPicks } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('is_top_pick', true)

  return NextResponse.json({
    token: {
      configured: tokenConfigured,
      valid: tokenValid,
    },
    provider: {
      mode: sourceMode,
      apify_configured: apifyAvailable,
      default_region: defaultRegion,
      proxy_configured: proxyConfigured,
      browser_sourced_ads: browserSourced ?? 0,
      api_sourced_ads: total - (browserSourced ?? 0),
    },
    ads: {
      total,
      poster_mirrored: withMirroredPoster ?? 0,
      poster_cdn: (withAnyThumb ?? 0) - (withMirroredPoster ?? 0),
      poster_direct_thumb: withDirectThumb ?? 0,
      poster_missing: total - (withAnyThumb ?? 0),
      video_detected: videoDetected ?? 0,
      video_promoted: withMirroredVideo ?? 0,
      fallback_rate: total > 0 ? Math.round(((fallbackPreview ?? 0) / total) * 100) : 0,
    },
    quality: {
      approved: qualityApproved ?? 0,
      rejected: qualityRejected ?? 0,
      pending: qualityPending ?? 0,
      top_picks: topPicks ?? 0,
      vector_memory: isAdMemoryAvailable(),
    },
  })
}

// ---------------------------------------------------------------------------
// Thumbnail warmup: extract real media URLs via Puppeteer and persist to DB
// ---------------------------------------------------------------------------

const WARMUP_CONCURRENCY = 2
const WARMUP_MAX_PER_SYNC = 10
const WARMUP_MAX_BULK = 50

async function warmSingleItem(
  db: SupabaseDb,
  item: { id: string; link_url: string | null },
): Promise<boolean> {
  if (!item.link_url) return false
  try {
    const media = await extractMediaFromSnapshot(item.link_url)
    if (!media?.thumbnailUrl) return false

    let thumbUrl = media.thumbnailUrl
    const mirrored = await mirrorMediaAsset(db, media.thumbnailUrl, item.id, 'thumb')
    if (mirrored) thumbUrl = mirrored

    const update: Record<string, unknown> = {
      thumbnail_url: thumbUrl,
      media_type: media.type,
    }
    if (media.videoUrl) {
      update.source_video_url = media.videoUrl
    }

    await db
      .from('briefing_source_items')
      .update(update)
      .eq('id', item.id)

    return true
  } catch (e) {
    console.error(`[thumbnail-warmup] Failed for ${item.id}:`, e instanceof Error ? e.message : e)
    return false
  }
}

async function runWarmupQueue(
  db: SupabaseDb,
  items: { id: string; link_url: string | null }[],
): Promise<{ warmed: number; failed: number }> {
  let warmed = 0
  let failed = 0
  const queue = [...items]

  const workers = Array.from({ length: WARMUP_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const item = queue.shift()
      if (!item) break
      const ok = await warmSingleItem(db, item)
      if (ok) warmed++
      else failed++
    }
  })

  await Promise.allSettled(workers)
  return { warmed, failed }
}

async function runThumbnailWarmup(db: SupabaseDb, itemIds: string[]) {
  if (itemIds.length === 0) return
  const batch = itemIds.slice(0, WARMUP_MAX_PER_SYNC)

  const { data: items } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url')
    .in('id', batch)

  const needsWarmup = (items ?? []).filter(
    (i: { thumbnail_url: string | null; link_url: string | null }) =>
      !isValidMediaUrl(i.thumbnail_url),
  )
  if (needsWarmup.length === 0) return

  const { warmed, failed } = await runWarmupQueue(db, needsWarmup)
  console.log(`[thumbnail-warmup] sync batch: ${warmed} warmed, ${failed} failed out of ${needsWarmup.length}`)
}

async function handleWarmThumbnails(db: SupabaseDb) {
  const { data: allItems, error: qErr } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url')
    .eq('source_type', 'meta_ad')
    .not('link_url', 'is', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  const toWarm = (allItems ?? []).filter(
    (i: { link_url: string | null; thumbnail_url: string | null }) =>
      !isValidMediaUrl(i.thumbnail_url),
  )

  if (toWarm.length === 0) {
    return NextResponse.json({ ok: true, message: 'All ads already have valid thumbnails', warmed: 0, failed: 0, remaining: 0 })
  }

  const batch = toWarm.slice(0, WARMUP_MAX_BULK)
  const { warmed, failed } = await runWarmupQueue(db, batch)

  return NextResponse.json({
    ok: true,
    candidates: batch.length,
    warmed,
    failed,
    remaining: Math.max(0, toWarm.length - batch.length),
  })
}

// ---------------------------------------------------------------------------
// On-demand media mirror: user-triggered download to CDN
// ---------------------------------------------------------------------------

async function handleMirrorMedia(
  db: SupabaseDb,
  body: { item_id?: string; type?: string },
) {
  const itemId = body.item_id
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  }

  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url, creative_url, source_video_url, media_type')
    .eq('id', itemId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  const wantVideo = body.type === 'video' || item.media_type === 'video'
  const results: { thumbnail_url?: string; creative_url?: string } = {}

  if (!isValidMediaUrl(item.thumbnail_url) || !item.thumbnail_url?.includes('supabase')) {
    if (item.link_url) {
      const media = await extractMediaFromSnapshot(item.link_url)
      if (media?.thumbnailUrl) {
        const mirrored = await mirrorMediaAsset(db, media.thumbnailUrl, itemId, 'thumb')
        if (mirrored) {
          results.thumbnail_url = mirrored
          await db.from('briefing_source_items').update({
            thumbnail_url: mirrored,
            media_type: media.type,
            ...(media.videoUrl ? { source_video_url: media.videoUrl } : {}),
          }).eq('id', itemId)
        }
      }
    }
  } else {
    results.thumbnail_url = item.thumbnail_url
  }

  if (wantVideo) {
    const videoSource = item.source_video_url || null
    if (videoSource) {
      const mirrored = await mirrorMediaAsset(db, videoSource, itemId, 'video')
      if (mirrored) {
        results.creative_url = mirrored
        await db.from('briefing_source_items').update({ creative_url: mirrored }).eq('id', itemId)
      }
    } else if (item.link_url) {
      const media = await extractMediaFromSnapshot(item.link_url)
      if (media?.videoUrl) {
        const mirrored = await mirrorMediaAsset(db, media.videoUrl, itemId, 'video')
        if (mirrored) {
          results.creative_url = mirrored
          await db.from('briefing_source_items').update({
            creative_url: mirrored,
            source_video_url: media.videoUrl,
          }).eq('id', itemId)
        }
      }
    }
  }

  return NextResponse.json({ ok: true, mirrored: results })
}

// ---------------------------------------------------------------------------
// Hot-set video promotion: mirror a full video for a specific ad
// ---------------------------------------------------------------------------

async function handlePromoteVideo(db: SupabaseDb, itemId: string) {
  const { data: item } = await db
    .from('briefing_source_items')
    .select('id, link_url, creative_url, source_video_url, media_type')
    .eq('id', itemId)
    .single()

  if (!item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  if (isValidMediaUrl(item.creative_url) && item.creative_url?.includes('supabase')) {
    return NextResponse.json({ ok: true, status: 'already_mirrored', creative_url: item.creative_url })
  }

  const videoSource = item.source_video_url || null
  if (!videoSource) {
    if (!item.link_url) {
      return NextResponse.json({ ok: false, status: 'no_source', message: 'No snapshot URL to extract from' })
    }
    const media = await extractMediaFromSnapshot(item.link_url)
    if (!media?.videoUrl) {
      return NextResponse.json({ ok: false, status: 'no_video', message: 'No video found in snapshot' })
    }

    const mirrored = await mirrorMediaAsset(db, media.videoUrl, itemId, 'video')
    if (!mirrored) {
      return NextResponse.json({ ok: false, status: 'mirror_failed' })
    }

    await db
      .from('briefing_source_items')
      .update({
        creative_url: mirrored,
        source_video_url: media.videoUrl,
        media_type: 'video',
      })
      .eq('id', itemId)

    return NextResponse.json({ ok: true, status: 'promoted', creative_url: mirrored })
  }

  const mirrored = await mirrorMediaAsset(db, videoSource, itemId, 'video')
  if (!mirrored) {
    return NextResponse.json({ ok: false, status: 'mirror_failed' })
  }

  await db
    .from('briefing_source_items')
    .update({ creative_url: mirrored })
    .eq('id', itemId)

  return NextResponse.json({ ok: true, status: 'promoted', creative_url: mirrored })
}

// ---------------------------------------------------------------------------
// Manual curation: top-pick / editorial override
// ---------------------------------------------------------------------------

async function handleManualPick(
  db: SupabaseDb,
  body: { item_id?: string; picked_by?: string; reason?: string; remove?: boolean },
) {
  const itemId = body.item_id
  if (!itemId) {
    return NextResponse.json({ error: 'item_id required' }, { status: 400 })
  }

  if (body.remove) {
    await db
      .from('briefing_source_items')
      .update({
        is_top_pick: false,
        quality_status: 'approved',
        picked_by: null,
        picked_reason: null,
      })
      .eq('id', itemId)
    return NextResponse.json({ ok: true, action: 'removed' })
  }

  await db
    .from('briefing_source_items')
    .update({
      is_top_pick: true,
      quality_status: 'manual_pick',
      picked_by: body.picked_by ?? 'editor',
      picked_reason: body.reason ?? null,
    })
    .eq('id', itemId)

  return NextResponse.json({ ok: true, action: 'picked' })
}

// ---------------------------------------------------------------------------
// Semantic V2 quality pass: heuristic gate + LLM tagging + scoring
// ---------------------------------------------------------------------------

const SEMANTIC_BATCH_SIZE = 8

async function runSemanticQualityPassForIds(db: SupabaseDb, itemIds: string[]) {
  if (itemIds.length === 0) return
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await applyHeuristicOnly(db, itemIds)
    return
  }

  const Anthropic = (await import('@anthropic-ai/sdk')).default
  const client = new Anthropic({ apiKey })

  const batch = itemIds.slice(0, SEMANTIC_BATCH_SIZE)
  const { data: items } = await db
    .from('briefing_source_items')
    .select('id, body_text, page_name, page_id, platform, media_type, cta_text, is_active, started_at, ended_at, thumbnail_url, creative_url, collation_count, quality_status')
    .in('id', batch)

  for (const item of items ?? []) {
    if ((item.quality_status as string) === 'manual_pick') continue
    try {
      await processSemanticItem(db, client, item)
    } catch (e) {
      console.error(`[semantic-pass] Failed for ${item.id}:`, e instanceof Error ? e.message : e)
    }
  }
}

async function runSemanticQualityPass(db: SupabaseDb) {
  const { data: pending } = await db
    .from('briefing_source_items')
    .select('id')
    .eq('source_type', 'meta_ad')
    .eq('quality_status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  const ids = (pending ?? []).map((r: { id: string }) => r.id)
  if (ids.length > 0) {
    await runSemanticQualityPassForIds(db, ids)
  }
}

async function applyHeuristicOnly(db: SupabaseDb, itemIds: string[]) {
  const { data: items } = await db
    .from('briefing_source_items')
    .select('id, body_text, is_active, started_at, ended_at, thumbnail_url, creative_url, collation_count, quality_status')
    .in('id', itemIds)

  for (const item of items ?? []) {
    if ((item.quality_status as string) === 'manual_pick') continue
    const ad: AdForTagging = {
      body_text: item.body_text as string | null,
      page_name: null,
      platform: null,
      media_type: null,
      is_active: item.is_active as boolean,
      started_at: item.started_at as string | null,
      ended_at: item.ended_at as string | null,
      thumbnail_url: item.thumbnail_url as string | null,
      creative_url: item.creative_url as string | null,
      collation_count: item.collation_count as number | null,
    }
    const heuristic = computeHeuristicGate(ad)
    const status = heuristic.pass ? 'approved' : 'rejected'
    const score = heuristic.pass ? 50 : 0
    await db
      .from('briefing_source_items')
      .update({
        quality_status: status,
        quality_score: score,
        quality_summary: heuristic.pass ? 'Passed heuristic gate' : `Failed: ${heuristic.reasons.join(', ')}`,
        days_running: heuristic.days_running,
      })
      .eq('id', item.id)
  }
}

async function processSemanticItem(
  db: SupabaseDb,
  anthropic: InstanceType<typeof import('@anthropic-ai/sdk').default>,
  item: Record<string, unknown>,
) {
  const ad: AdForTagging = {
    body_text: item.body_text as string | null,
    page_name: item.page_name as string | null,
    platform: item.platform as string | null,
    media_type: item.media_type as string | null,
    cta_text: item.cta_text as string | null,
    is_active: item.is_active as boolean,
    started_at: item.started_at as string | null,
    ended_at: item.ended_at as string | null,
    thumbnail_url: item.thumbnail_url as string | null,
    creative_url: item.creative_url as string | null,
    collation_count: item.collation_count as number | null,
  }

  const heuristic = computeHeuristicGate(ad)
  const prompt = buildSemanticTaggingPrompt(ad, heuristic.days_running)

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : ''
  const tags = parseSemanticResponse(rawText)

  if (!tags) {
    await applyHeuristicOnly(db, [item.id as string])
    return
  }

  const { data: existingScores } = await db
    .from('briefing_analysis_scores')
    .select('score_overall')
    .eq('source_item_id', item.id as string)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const rubricOverall = (existingScores?.score_overall as number) ?? null
  const { score, status } = computeQualityScore(heuristic, tags, rubricOverall)

  await db
    .from('briefing_source_items')
    .update({
      quality_status: status,
      quality_score: score,
      quality_summary: tags.quality_summary,
      content_style_tags: tags.content_style_tags,
      hook_type: tags.hook_type,
      proof_type: tags.proof_type,
      creator_style: tags.creator_style,
      target_market: tags.target_market,
      ai_slop_risk: tags.ai_slop_risk,
      legibility_risk: tags.legibility_risk,
      proof_missing_risk: tags.proof_missing_risk,
      duplicate_risk: 0,
      days_running: heuristic.days_running,
    })
    .eq('id', item.id)

  if (status === 'approved' && isAdMemoryAvailable()) {
    const embeddingText = [
      item.page_name,
      item.body_text,
      tags.content_style_tags.join(', '),
      tags.hook_type,
    ].filter(Boolean).join(' | ')

    const embedding = await embedAdCreative(embeddingText)
    if (embedding) {
      await upsertAdEmbedding(item.id as string, embeddingText, embedding, {
        page_name: item.page_name as string,
        content_style: tags.content_style_tags[0],
        quality_status: status,
      })
    }
  }

  await indexAdInGraph(item.id as string, {
    page_name: item.page_name as string | null,
    page_id: item.page_id as string | null,
    hook_type: tags.hook_type,
    content_style_tags: tags.content_style_tags,
    proof_type: tags.proof_type,
    creator_style: tags.creator_style,
    media_type: item.media_type as string | null,
    target_market: tags.target_market,
  }).catch(() => {})
}

// ---------------------------------------------------------------------------
// Retention cleanup: expire old competitor media to save storage
// ---------------------------------------------------------------------------

const POSTER_TTL_DAYS = 90
const VIDEO_TTL_DAYS = 14

async function handleCleanupMedia(db: SupabaseDb) {
  const posterCutoff = new Date(Date.now() - POSTER_TTL_DAYS * 86400000).toISOString()
  const videoCutoff = new Date(Date.now() - VIDEO_TTL_DAYS * 86400000).toISOString()

  const { data: stalePosters } = await db
    .from('briefing_source_items')
    .select('id, thumbnail_url')
    .eq('source_type', 'meta_ad')
    .neq('media_tier', 'first_party')
    .lt('updated_at', posterCutoff)
    .not('thumbnail_url', 'is', null)
    .limit(100)

  let postersCleared = 0
  for (const item of stalePosters ?? []) {
    if (item.thumbnail_url?.includes('supabase')) {
      const path = item.thumbnail_url.split('/briefing-media/').pop()
      if (path) {
        await db.storage.from('briefing-media').remove([path])
      }
    }
    await db
      .from('briefing_source_items')
      .update({ thumbnail_url: null, creative_url: null })
      .eq('id', item.id)
    postersCleared++
  }

  const { data: staleVideos } = await db
    .from('briefing_source_items')
    .select('id, creative_url')
    .eq('source_type', 'meta_ad')
    .neq('media_tier', 'first_party')
    .lt('updated_at', videoCutoff)
    .not('creative_url', 'is', null)
    .limit(100)

  let videosCleared = 0
  for (const item of staleVideos ?? []) {
    if (item.creative_url?.includes('supabase')) {
      const path = item.creative_url.split('/briefing-media/').pop()
      if (path) {
        await db.storage.from('briefing-media').remove([path])
      }
    }
    await db
      .from('briefing_source_items')
      .update({ creative_url: null })
      .eq('id', item.id)
    videosCleared++
  }

  return NextResponse.json({
    ok: true,
    posters_cleared: postersCleared,
    videos_cleared: videosCleared,
    poster_ttl_days: POSTER_TTL_DAYS,
    video_ttl_days: VIDEO_TTL_DAYS,
  })
}
