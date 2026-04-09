import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireFeedbackReviewer } from '@/lib/route-auth'
import { getReview, upsertReview } from '@/src/services/opsFeedbackStore'
import { getItemByMondayId } from '@/src/services/opsBoardStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ops/feedback-summarize
 * Body: { item_id, board_id }
 * Generates a Claude-powered summary of versioned feedback, caches it, and returns it.
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedbackReviewer(req)
  if (auth.error) return auth.error

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  let body: { item_id?: string; board_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { item_id, board_id } = body
  if (!item_id || !board_id) {
    return NextResponse.json({ error: 'item_id and board_id are required' }, { status: 400 })
  }

  const review = await getReview(item_id, board_id)
  if (!review || !review.feedback_doc_cache) {
    return NextResponse.json({ error: 'No cached feedback doc — open the feedback tab first' }, { status: 404 })
  }

  const feedbackText = review.feedback_doc_cache
  const parsed = review.parsed_feedback as Record<string, Record<string, string>>
  const versionKeys = Object.keys(parsed).sort()

  let structuredContext = ''
  if (versionKeys.length > 0) {
    structuredContext = versionKeys.map(v => {
      const variations = parsed[v]
      const varLines = Object.entries(variations ?? {}).map(([varKey, text]) =>
        `### ${varKey}\n${text}`
      ).join('\n\n')
      return `## ${v.toUpperCase()}\n${varLines}`
    }).join('\n\n---\n\n')
  }

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      thinking: { type: 'enabled', budget_tokens: 4000 },
      messages: [
        {
          role: 'user',
          content: `You are summarizing creative feedback for a briefing so it can be shared with an agency or creative team.

The feedback follows a versioned structure where each version (v1, v2, v3, etc.) represents a feedback round. Each version may have multiple variations (variation 1, 2, 3, 4).

CRITICAL RULES:
1. The LATEST version's feedback takes precedence. Earlier version feedback should be considered resolved unless explicitly restated.
2. Do NOT blindly merge feedback from different versions — later versions may override or refine earlier feedback.
3. If you detect contradicting feedback between versions or within the same version, explicitly call it out.
4. Summarize per-variation where relevant, but consolidate when feedback applies across all variations.
5. Write in clear, actionable prose. Avoid bullet points unless necessary for clarity.
6. Keep the summary concise: 3-6 sentences unless the feedback is genuinely complex.

${structuredContext ? `STRUCTURED FEEDBACK:\n\n${structuredContext}\n\n---\n\n` : ''}RAW FEEDBACK DOC:\n\n${feedbackText}

Respond with TWO sections separated by "---CONTRADICTIONS---":
1. The summary (plain text, no markdown headers)
2. Any contradiction notes (or "none" if no contradictions detected)`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const fullResponse = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    let summary = fullResponse
    let contradictionNote: string | null = null

    const splitIdx = fullResponse.indexOf('---CONTRADICTIONS---')
    if (splitIdx !== -1) {
      summary = fullResponse.slice(0, splitIdx).trim()
      const contradictions = fullResponse.slice(splitIdx + '---CONTRADICTIONS---'.length).trim()
      if (contradictions && contradictions.toLowerCase() !== 'none') {
        contradictionNote = contradictions
      }
    }

    const boardItem = await getItemByMondayId(item_id, board_id)
    if (boardItem) {
      await upsertReview({
        boardItemId: boardItem.id,
        mondayItemId: item_id,
        mondayBoardId: board_id,
        generated_summary: summary,
        contradiction_note: contradictionNote,
        summary_model: 'claude-sonnet-4-20250514',
        generated_at: new Date().toISOString(),
        summary_draft: summary,
        draft_updated_at: new Date().toISOString(),
      })
    }

    return NextResponse.json({
      summary,
      contradiction_note: contradictionNote,
      item_id,
      board_id,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
