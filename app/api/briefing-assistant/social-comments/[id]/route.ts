import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function extractDateFromText(text: string | null): string | null {
  if (!text) return null
  const match = text.match(/Time Posted \(UTC\):\s*(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[^\n]*)/)
  if (match) {
    try {
      const d = new Date(match[1].trim())
      if (!isNaN(d.getTime())) return d.toISOString()
    } catch { /* ignore */ }
  }
  return null
}

/**
 * GET /api/briefing-assistant/social-comments/:id
 * Returns full post detail immediately (no blocking AI call).
 * AI summary is fetched separately via /summary sub-route.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: row, error } = await db
    .from('briefing_source_items')
    .select('id, title, preview, body_text, thumbnail_url, link_url, platform, tags, created_at, started_at, raw_data')
    .eq('id', id)
    .eq('source_type', 'social_comment')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const raw = (row.raw_data ?? {}) as Record<string, unknown>

  return NextResponse.json({
    id: row.id,
    title: row.title,
    body_text: row.body_text ?? row.preview ?? '',
    preview: row.preview ?? '',
    thumbnail: row.thumbnail_url,
    url: row.link_url,
    platform: row.platform ?? 'reddit',
    tags: row.tags ?? [],
    published_at: row.started_at ?? extractDateFromText(row.body_text as string | null),
    discovered_at: row.created_at,
    relevance_score: (raw.relevance_score as number) ?? null,
    authenticity_score: (raw.authenticity_score as number) ?? null,
    creative_angles: (raw.creative_angles as string[]) ?? [],
    language_hooks: (raw.language_hooks as string[]) ?? [],
    highlights: (raw.highlights as string[]) ?? [],
    subreddit: (raw.subreddit as string) ?? null,
    author: (raw.author as string) ?? null,
    ai_summary: (raw.ai_summary as string) ?? null,
  })
}
