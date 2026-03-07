import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { searchMetaAdLibrary, normalizeMetaAd, isMetaAdLibraryAvailable, MetaTokenError } from '@/src/integrations/meta/client'
import { buildScoringPrompt, computeOverallScore, RUBRIC_VERSION } from '@/src/domain/briefingAssistant/scoring/rubric'
import { extractMediaFromSnapshot } from '@/src/integrations/meta/preview'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/meta-ads?q=...&active=true&limit=50
 *       ?check=health — lightweight health check for token + thumbnail coverage
 * Returns normalized ads from DB. Search checks both body_text and page_name.
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

  const q = searchParams.get('q')?.trim() || null
  const activeOnly = searchParams.get('active') === 'true'
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

  let query = db
    .from('briefing_source_items')
    .select(`
      id, source_type, external_id, title, preview, thumbnail_url, creative_url,
      body_text, link_url, media_type, platform, page_name, is_active,
      started_at, ended_at, spend_lower, spend_upper, impressions_lower, impressions_upper,
      tags, created_at, updated_at
    `)
    .eq('source_type', 'meta_ad')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (q) {
    query = query.or(`body_text.ilike.%${q}%,page_name.ilike.%${q}%,title.ilike.%${q}%`)
  }
  if (activeOnly) query = query.eq('is_active', true)

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
    const fallbackPreview = `/api/briefing-assistant/meta-ads/${item.id}/preview`
    const thumb = (item.thumbnail_url as string | null) || fallbackPreview
    const creative = (item.creative_url as string | null) || fallbackPreview
    return {
      id: item.id,
      ad_id: item.external_id,
      page_name: item.page_name ?? item.title,
      creative_url: creative,
      thumbnail_url: thumb,
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
    }
  })

  return NextResponse.json({ ads })
}

/**
 * POST /api/briefing-assistant/meta-ads
 *
 * Actions:
 *   ?action=warm-thumbnails  — re-extract media for ads missing thumbnails (bounded)
 *   (default)                — sync ads from Meta Ad Library API
 *
 * Sync body: { search_terms, page_ids?, countries?, limit? }
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

  if (!isMetaAdLibraryAvailable()) {
    return NextResponse.json(
      { error: 'META_AD_LIBRARY_ACCESS_TOKEN not configured' },
      { status: 503 },
    )
  }

  const body = await req.json().catch(() => ({}))
  const {
    search_terms,
    page_ids,
    countries = ['US', 'GB', 'NL', 'BE', 'DE', 'AU'],
    limit = 50,
  } = body as {
    search_terms?: string
    page_ids?: string[]
    countries?: string[]
    limit?: number
  }

  if (!search_terms?.trim() && !page_ids?.length) {
    return NextResponse.json(
      { error: 'Provide search_terms or page_ids to sync ads from Meta.' },
      { status: 400 },
    )
  }

  try {
    const result = await searchMetaAdLibrary({
      search_terms: search_terms?.trim(),
      search_page_ids: page_ids,
      ad_reached_countries: countries,
      limit: Math.min(limit, 100),
    })

    const ingestedIds: string[] = []
    const rows = result.data.map((ad) => {
      const n = normalizeMetaAd(ad)
      return {
        source_type: 'meta_ad' as const,
        external_id: n.external_id,
        title: n.title,
        preview: n.preview,
        page_name: n.page_name,
        body_text: n.body_text,
        link_url: n.link_url,
        creative_url: n.creative_url,
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
      }
    })

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

    runAutoAnalysis(db, ingestedIds).catch(console.error)
    runThumbnailWarmup(db, ingestedIds).catch(console.error)

    return NextResponse.json({
      ok: true,
      fetched: result.data.length,
      ingested: ingestedIds.length,
      ingested_ids: ingestedIds,
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

  const { count: withThumbnail } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .not('thumbnail_url', 'is', null)
    .not('thumbnail_url', 'like', 'data:%')

  const { count: withVideo } = await db
    .from('briefing_source_items')
    .select('id', { count: 'exact', head: true })
    .eq('source_type', 'meta_ad')
    .eq('media_type', 'video')

  return NextResponse.json({
    token: {
      configured: tokenConfigured,
      valid: tokenValid,
    },
    ads: {
      total: totalAds ?? 0,
      with_thumbnail: withThumbnail ?? 0,
      missing_thumbnail: (totalAds ?? 0) - (withThumbnail ?? 0),
      video_count: withVideo ?? 0,
    },
  })
}

// ---------------------------------------------------------------------------
// Thumbnail warmup: extract real media URLs via Puppeteer and persist to DB
// ---------------------------------------------------------------------------

const WARMUP_CONCURRENCY = 2
const WARMUP_MAX_PER_SYNC = 10
const WARMUP_MAX_BULK = 50

type SupabaseDb = NonNullable<ReturnType<typeof getSupabase>>

async function warmSingleItem(
  db: SupabaseDb,
  item: { id: string; link_url: string | null },
): Promise<boolean> {
  if (!item.link_url) return false
  try {
    const media = await extractMediaFromSnapshot(item.link_url)
    if (!media?.thumbnailUrl) return false

    const update: Record<string, string> = {
      thumbnail_url: media.thumbnailUrl,
      media_type: media.type,
    }
    if (media.videoUrl) update.creative_url = media.videoUrl

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
      !i.thumbnail_url || i.thumbnail_url.startsWith('data:'),
  )
  if (needsWarmup.length === 0) return

  const { warmed, failed } = await runWarmupQueue(db, needsWarmup)
  console.log(`[thumbnail-warmup] sync batch: ${warmed} warmed, ${failed} failed out of ${needsWarmup.length}`)
}

async function handleWarmThumbnails(db: SupabaseDb) {
  const { data: items, error: qErr } = await db
    .from('briefing_source_items')
    .select('id, link_url, thumbnail_url')
    .eq('source_type', 'meta_ad')
    .or('thumbnail_url.is.null,thumbnail_url.like.data:%')
    .order('created_at', { ascending: false })
    .limit(WARMUP_MAX_BULK)

  if (qErr) {
    return NextResponse.json({ error: qErr.message }, { status: 500 })
  }

  const toWarm = (items ?? []).filter(
    (i: { link_url: string | null }) => !!i.link_url,
  )

  if (toWarm.length === 0) {
    return NextResponse.json({ ok: true, message: 'All ads already have thumbnails', warmed: 0, failed: 0 })
  }

  const { warmed, failed } = await runWarmupQueue(db, toWarm)

  return NextResponse.json({
    ok: true,
    candidates: toWarm.length,
    warmed,
    failed,
  })
}
