import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function isValidMediaUrl(url: string | null): boolean {
  if (!url) return false
  if (url.startsWith('data:') || url.startsWith('/api/')) return false
  if (url.includes('/ads/archive/render_ad/') || url.includes('/ads/library/?id=')) return false
  try { return new URL(url).protocol.startsWith('http') } catch { return false }
}

/**
 * GET /api/briefing-assistant/meta-ads/[adId]
 * Returns a single ad with full analysis scores.
 * No longer auto-mirrors videos on browse; mirroring is user-triggered
 * via POST ?action=mirror-media on the main meta-ads route.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { adId } = await params
  if (!adId) {
    return NextResponse.json({ error: 'adId required' }, { status: 400 })
  }

  const { data: item, error: itemErr } = await db
    .from('briefing_source_items')
    .select('*')
    .eq('id', adId)
    .single()

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Ad not found' }, { status: 404 })
  }

  db.from('briefing_source_items')
    .update({ last_viewed_at: new Date().toISOString() })
    .eq('id', adId)
    .then(() => {})
    .catch(() => {})

  const { data: scores } = await db
    .from('briefing_analysis_scores')
    .select('*')
    .eq('source_item_id', adId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const fallbackPreview = `/api/briefing-assistant/meta-ads/${item.id}/preview`
  const ad = {
    id: item.id,
    ad_id: item.external_id,
    page_id: item.page_id ?? null,
    page_name: item.page_name ?? item.title,
    creative_url: isValidMediaUrl(item.creative_url) ? item.creative_url : (isValidMediaUrl(item.thumbnail_url) ? item.thumbnail_url : fallbackPreview),
    thumbnail_url: isValidMediaUrl(item.thumbnail_url) ? item.thumbnail_url : fallbackPreview,
    media_type: item.media_type ?? 'image',
    body_text: item.body_text,
    link_url: item.link_url || `/api/briefing-assistant/meta-ads/${item.id}/snapshot`,
    started_at: item.started_at,
    ended_at: item.ended_at,
    is_active: item.is_active ?? false,
    platform: item.platform ?? 'meta',
    spend_lower: item.spend_lower,
    spend_upper: item.spend_upper,
    impressions_lower: item.impressions_lower,
    impressions_upper: item.impressions_upper,
    tags: item.tags ?? [],
    score_hook: scores?.score_hook ?? null,
    score_attention: scores?.score_attention ?? null,
    score_clarity: scores?.score_clarity ?? null,
    score_cta: scores?.score_cta ?? null,
    score_overall: scores?.score_overall ?? null,
    analysis_summary: scores?.analysis_summary ?? null,
  }

  return NextResponse.json({ ad })
}
