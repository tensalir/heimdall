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
 * Strip the scraped metadata preamble from Reddit body text.
 * Raw text often starts with: title, Author:, Time Posted:, Score:, Link:
 * followed by the actual content. Remove those lines so only the post body remains.
 */
function stripBodyPreamble(body: string, title: string): string {
  const lines = body.split('\n')
  let startIdx = 0
  const metaPatterns = [
    /^Author:\s/i,
    /^Time Posted/i,
    /^Score:\s/i,
    /^Link:\s/i,
  ]

  for (let i = 0; i < Math.min(lines.length, 15); i++) {
    const trimmed = lines[i].trim()
    if (!trimmed) { startIdx = i + 1; continue }
    const isTitle = trimmed === title.trim() || title.trim().startsWith(trimmed)
    const isMeta = metaPatterns.some((p) => p.test(trimmed))
    if (isTitle || isMeta) { startIdx = i + 1; continue }
    break
  }

  return lines.slice(startIdx).join('\n').replace(/^\n+/, '').trim()
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

  const rawBody = (row.body_text ?? row.preview ?? '') as string
  const cleanBody = stripBodyPreamble(rawBody, row.title as string)

  return NextResponse.json({
    id: row.id,
    title: row.title,
    body_text: cleanBody || row.preview || '',
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
