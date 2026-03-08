import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/comments/summarize
 *
 * Accepts comment messages, a layer name, and optionally a fileKey + nodeId
 * for Supabase caching. Returns a concise AI-generated summary using
 * extended thinking. Cached summaries are returned instantly when the
 * comment count hasn't changed.
 *
 * Body: { comments: string[], nodeName: string, fileKey?: string, nodeId?: string }
 * Returns: { summary: string, cached: boolean }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 503 }
    )
  }

  let body: { comments?: string[]; nodeName?: string; fileKey?: string; nodeId?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { comments, nodeName, fileKey, nodeId } = body
  if (!comments || !Array.isArray(comments) || comments.length === 0) {
    return NextResponse.json(
      { error: 'Missing or empty "comments" array' },
      { status: 400 }
    )
  }

  // Check Supabase cache if fileKey + nodeId provided
  const sb = getSupabase()
  if (sb && fileKey && nodeId) {
    try {
      const { data: cached } = await sb
        .from('comment_summaries')
        .select('summary, comment_count')
        .eq('file_key', fileKey)
        .eq('node_id', nodeId)
        .single()

      if (cached && cached.comment_count === comments.length) {
        return NextResponse.json({ summary: cached.summary, cached: true })
      }
    } catch {
      // Cache miss or table not ready — continue to generate
    }
  }

  const layerLabel = nodeName || 'this layer'
  const commentBlock = comments
    .slice(0, 40)
    .map((c, i) => `${i + 1}. ${c}`)
    .join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      thinking: {
        type: 'enabled',
        budget_tokens: 4000,
      },
      messages: [
        {
          role: 'user',
          content: `Summarize the design feedback on Figma layer "${layerLabel}" for the designer who needs to act on it.

Rules:
- Max 1-2 short sentences. Be blunt and specific.
- Focus on WHAT needs to change, not what was discussed. State decisions and open action items.
- Name concrete design elements: copy text, colors, layout, imagery — not meta-commentary about the conversation.
- If a decision was reached, state it as fact. If something is unresolved, flag it.
- Do not use bullet points, markdown, or filler words.

Comments (chronological):
${commentBlock}`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const text = textBlock?.type === 'text' ? textBlock.text : ''
    const summary = text.trim()

    // Store in Supabase cache (non-blocking)
    if (sb && fileKey && nodeId && summary) {
      sb.from('comment_summaries')
        .upsert(
          {
            file_key: fileKey,
            node_id: nodeId,
            summary,
            comment_count: comments.length,
            generated_at: new Date().toISOString(),
          },
          { onConflict: 'file_key,node_id' }
        )
        .then(() => {})
        .catch((e) => console.error('[Heimdall] Failed to cache summary:', e))
    }

    return NextResponse.json({ summary, cached: false })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
