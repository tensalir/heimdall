import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/trends/:id
 * Returns full article detail immediately (no blocking AI call).
 * AI summary is fetched separately via /summary sub-route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const { id } = await params

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: row, error } = await db
    .from('briefing_source_items')
    .select('id, title, preview, body_text, thumbnail_url, link_url, platform, tags, created_at, started_at, raw_data')
    .eq('id', id)
    .eq('source_type', 'trend')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Trend not found' }, { status: 404 })
  }

  const raw = (row.raw_data ?? {}) as Record<string, unknown>

  return NextResponse.json({
    id: row.id,
    title: row.title,
    body_text: row.body_text ?? row.preview ?? '',
    preview: row.preview ?? '',
    thumbnail: row.thumbnail_url,
    url: row.link_url,
    source: row.platform ?? '',
    tags: row.tags ?? [],
    published_at: row.started_at,
    discovered_at: row.created_at,
    relevance_score: (raw.relevance_score as number) ?? null,
    creative_angles: (raw.creative_angles as string[]) ?? [],
    highlights: (raw.highlights as string[]) ?? [],
    author: (raw.author as string) ?? null,
    ai_summary: (raw.ai_summary as string) ?? null,
  })
}
