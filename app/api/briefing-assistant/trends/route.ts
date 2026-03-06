import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/trends?q=...
 * Returns trend-type source items.
 */
export async function GET(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ trends: [] })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null

  let query = db
    .from('briefing_source_items')
    .select('id, title, preview, platform, link_url, tags, created_at, raw_data')
    .eq('source_type', 'trend')
    .order('created_at', { ascending: false })
    .limit(50)

  if (q) query = query.ilike('title', `%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ trends: [] })
  }

  const trends = (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id,
    title: row.title,
    description: row.preview ?? '',
    source: row.platform ?? 'internal',
    url: row.link_url,
    relevance_score: (row.raw_data as Record<string, unknown>)?.relevance_score as number | null ?? null,
    discovered_at: row.created_at,
    tags: row.tags ?? [],
  }))

  return NextResponse.json({ trends })
}
