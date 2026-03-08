import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
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
 * Returns full post detail with on-demand Claude summary.
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
  let aiSummary = (raw.ai_summary as string) ?? null

  if (!aiSummary && (row.body_text || row.preview)) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey) {
      try {
        const content = row.body_text || row.preview || ''
        const subreddit = (raw.subreddit as string) ?? ''
        const client = new Anthropic({ apiKey })
        const response = await client.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 512,
          messages: [
            {
              role: 'user',
              content: `Summarize this Reddit post from r/${subreddit} in one short paragraph (3-4 sentences) for a creative strategist at Loop (earplugs, earmuffs, and hearing protection brand). Focus on the consumer insight, the relatable problem or desire, and any potential ad angle. Be specific, not generic. Write in plain text only — no markdown, no bold, no bullet points, no asterisks, no formatting of any kind.\n\nTitle: ${row.title}\n\nContent:\n${content}`,
            },
          ],
        })

        const textBlock = response.content.find((b) => b.type === 'text')
        const rawSummary = textBlock?.type === 'text' ? textBlock.text.trim() : null
        aiSummary = rawSummary
          ? rawSummary.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').replace(/^[-–•]\s*/gm, '').replace(/#{1,4}\s*/g, '').trim()
          : null

        if (aiSummary) {
          const updatedRaw = { ...raw, ai_summary: aiSummary }
          await db
            .from('briefing_source_items')
            .update({ raw_data: updatedRaw })
            .eq('id', id)
        }
      } catch (err) {
        console.error('[SocialPostDetail] Claude summary failed:', err)
      }
    }
  }

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
    ai_summary: aiSummary,
  })
}
