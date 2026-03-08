import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { VERTICALS } from '@/src/services/trendDiscoveryService'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/trends?q=...&vertical=...
 * Returns trend-type source items with optional vertical filtering.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = auth.supabase

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
  const vertical = searchParams.get('vertical')?.trim() || null

  let query = db
    .from('briefing_source_items')
    .select('id, title, preview, body_text, thumbnail_url, platform, link_url, tags, created_at, started_at, raw_data')
    .eq('source_type', 'trend')
    .order('created_at', { ascending: false })
    .limit(60)

  if (q) query = query.ilike('title', `%${q}%`)

  if (vertical) {
    query = query.contains('tags', [vertical])
    query = query.not('external_id', 'like', 'digest-%')
  } else {
    query = query.not('external_id', 'like', 'digest-%')
  }

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ trends: [], verticals: VERTICALS.map((v) => ({ id: v.id, label: v.label })) })
  }

  const trends = (data ?? []).map((row: Record<string, unknown>) => {
    const raw = (row.raw_data ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      title: row.title,
      description: row.preview ?? '',
      source: row.platform ?? 'unknown',
      url: row.link_url,
      thumbnail: row.thumbnail_url ?? null,
      relevance_score: (raw.relevance_score as number) ?? null,
      creative_angles: (raw.creative_angles as string[]) ?? [],
      highlights: (raw.highlights as string[]) ?? [],
      author: (raw.author as string) ?? null,
      discovered_at: row.created_at,
      published_at: row.started_at ?? null,
      tags: (row.tags as string[]) ?? [],
    }
  })

  return NextResponse.json({
    trends,
    verticals: VERTICALS.map((v) => ({ id: v.id, label: v.label })),
  })
}
