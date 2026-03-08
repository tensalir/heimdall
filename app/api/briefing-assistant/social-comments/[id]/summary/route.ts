import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/social-comments/:id/summary
 * Generates AI summary on demand and persists it.
 * Called asynchronously by the detail client after the main payload loads.
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
    .select('id, title, preview, body_text, raw_data')
    .eq('id', id)
    .eq('source_type', 'social_comment')
    .single()

  if (error || !row) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  }

  const raw = (row.raw_data ?? {}) as Record<string, unknown>
  const existing = (raw.ai_summary as string) ?? null
  if (existing) {
    return NextResponse.json({ ai_summary: existing })
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey || !(row.body_text || row.preview)) {
    return NextResponse.json({ ai_summary: null })
  }

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
          content: `Summarize this Reddit post from r/${subreddit} in exactly one sentence (max 30 words) for a creative strategist at Loop Earplugs. State the core consumer insight or ad angle. Be specific, not generic. Plain text only — no markdown, no formatting.\n\nTitle: ${row.title}\n\nContent:\n${content}`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawSummary = textBlock?.type === 'text' ? textBlock.text.trim() : null
    const aiSummary = rawSummary
      ? rawSummary.replace(/\*{1,2}([^*]+)\*{1,2}/g, '$1').replace(/^[-–•]\s*/gm, '').replace(/#{1,4}\s*/g, '').trim()
      : null

    if (aiSummary) {
      const updatedRaw = { ...raw, ai_summary: aiSummary }
      await db
        .from('briefing_source_items')
        .update({ raw_data: updatedRaw })
        .eq('id', id)
    }

    return NextResponse.json({ ai_summary: aiSummary })
  } catch (err) {
    console.error('[SocialPostDetail] Claude summary failed:', err)
    return NextResponse.json({ ai_summary: null })
  }
}
