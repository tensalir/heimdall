import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { searchMetaAdLibrary, normalizeMetaAd, isMetaAdLibraryAvailable } from '@/src/integrations/meta/client'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/meta-ads?q=...&page_name=...&active=true&limit=50
 * Returns normalized ads from DB (ingested source_items of type meta_ad).
 * If no results and Meta API is available, fetches live from Meta Ad Library.
 */
export async function GET(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
  const pageName = searchParams.get('page_name')?.trim() || null
  const activeOnly = searchParams.get('active') === 'true'
  const limit = Math.min(Number(searchParams.get('limit') || 50), 200)

  let query = db
    .from('briefing_source_items')
    .select(`
      id, source_type, external_id, title, preview, thumbnail_url, creative_url,
      body_text, link_url, media_type, platform, page_name, is_active,
      started_at, ended_at, spend_lower, spend_upper, impressions_lower, impressions_upper,
      tags, created_at
    `)
    .eq('source_type', 'meta_ad')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (q) query = query.ilike('body_text', `%${q}%`)
  if (pageName) query = query.ilike('page_name', `%${pageName}%`)
  if (activeOnly) query = query.eq('is_active', true)

  const { data: items, error: dbErr } = await query
  if (dbErr) {
    return NextResponse.json({ error: dbErr.message }, { status: 500 })
  }

  const scoreQuery = await db
    .from('briefing_analysis_scores')
    .select('source_item_id, score_hook, score_overall')
    .in('source_item_id', (items ?? []).map((i: { id: string }) => i.id))

  const scoreMap = new Map<string, { score_hook: number | null; score_overall: number | null }>()
  for (const s of scoreQuery.data ?? []) {
    scoreMap.set(s.source_item_id, { score_hook: s.score_hook, score_overall: s.score_overall })
  }

  const ads = (items ?? []).map((item: Record<string, unknown>) => {
    const scores = scoreMap.get(item.id as string)
    return {
      id: item.id,
      ad_id: item.external_id,
      page_name: item.page_name ?? item.title,
      creative_url: item.creative_url,
      thumbnail_url: item.thumbnail_url,
      media_type: item.media_type ?? 'image',
      body_text: item.body_text,
      link_url: item.link_url,
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
 * Sync ads from Meta Ad Library API. Body: { search_terms?, page_ids?, countries?, limit? }
 */
export async function POST(req: NextRequest) {
  if (!isMetaAdLibraryAvailable()) {
    return NextResponse.json(
      { error: 'META_AD_LIBRARY_ACCESS_TOKEN not configured' },
      { status: 503 },
    )
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
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

  try {
    const result = await searchMetaAdLibrary({
      search_terms,
      search_page_ids: page_ids,
      ad_reached_countries: countries,
      limit: Math.min(limit, 100),
    })

    let ingested = 0
    for (const ad of result.data) {
      const normalized = normalizeMetaAd(ad)
      const { error: upsertErr } = await db
        .from('briefing_source_items')
        .upsert(
          {
            source_type: 'meta_ad',
            external_id: normalized.external_id,
            title: normalized.title,
            preview: normalized.preview,
            page_name: normalized.page_name,
            body_text: normalized.body_text,
            link_url: normalized.link_url,
            thumbnail_url: normalized.thumbnail_url,
            media_type: normalized.media_type,
            platform: normalized.platform,
            is_active: normalized.is_active,
            started_at: normalized.started_at,
            ended_at: normalized.ended_at,
            spend_lower: normalized.spend_lower,
            spend_upper: normalized.spend_upper,
            impressions_lower: normalized.impressions_lower,
            impressions_upper: normalized.impressions_upper,
            raw_data: normalized.raw_data,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'source_type,external_id' },
        )
      if (!upsertErr) ingested++
    }

    return NextResponse.json({ ok: true, fetched: result.data.length, ingested })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Sync failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
