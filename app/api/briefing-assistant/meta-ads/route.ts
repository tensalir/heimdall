import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { searchMetaAdLibrary, normalizeMetaAd, isMetaAdLibraryAvailable } from '@/src/integrations/meta/client'
import { buildScoringPrompt, computeOverallScore, RUBRIC_VERSION } from '@/src/domain/briefingAssistant/scoring/rubric'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/meta-ads?q=...&active=true&limit=50
 * Returns normalized ads from DB. Search checks both body_text and page_name.
 */
export async function GET(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
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
 * Sync ads from Meta Ad Library API and auto-score them.
 * Body: { search_terms, page_ids?, countries?, limit? }
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
    for (const ad of result.data) {
      const normalized = normalizeMetaAd(ad)
      const { data: upserted, error: upsertErr } = await db
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
        .select('id')
      if (!upsertErr && upserted?.[0]?.id) {
        ingestedIds.push(upserted[0].id)
      }
    }

    runAutoAnalysis(db, ingestedIds).catch(console.error)

    return NextResponse.json({
      ok: true,
      fetched: result.data.length,
      ingested: ingestedIds.length,
      ingested_ids: ingestedIds,
    })
  } catch (e) {
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
