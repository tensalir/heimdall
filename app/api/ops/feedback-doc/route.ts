import { NextResponse } from 'next/server'
import { getMondayItem } from '@/src/api/webhooks/monday'
import { columnMap, getCol } from '@/src/integrations/monday/client'
import { getDocContent, getDocIdFromColumnValue } from '@/src/integrations/monday/docReader'
import { getReview, upsertReview, parseFeedbackDoc } from '@/src/services/opsFeedbackStore'
import { getItemByMondayId } from '@/src/services/opsBoardStore'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ops/feedback-doc?item_id=X&board_id=Y
 * Fetches the feedback doc for a Monday item, caches it, and returns parsed structure + review state.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const itemId = url.searchParams.get('item_id')
  const boardId = url.searchParams.get('board_id')

  if (!itemId) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }

  try {
    const existing = await getReview(itemId, boardId ?? '')

    const item = await getMondayItem(boardId ?? '', itemId)
    if (!item) {
      return NextResponse.json({ error: 'Monday item not found' }, { status: 404 })
    }

    const col = columnMap(item)
    const feedbackRaw = getCol(col, 'feedback', 'feedback_doc', 'creative_feedback', 'fb_doc')
    const feedbackDocId = getDocIdFromColumnValue(feedbackRaw ?? null)
    const feedbackDocContent = feedbackDocId ? await getDocContent(feedbackDocId) : null

    const parsed = feedbackDocContent ? parseFeedbackDoc(feedbackDocContent) : {}

    const boardItem = await getItemByMondayId(itemId, boardId ?? '')
    if (boardItem && feedbackDocContent) {
      await upsertReview({
        boardItemId: boardItem.id,
        mondayItemId: itemId,
        mondayBoardId: boardId ?? '',
        feedback_doc_cache: feedbackDocContent,
        feedback_doc_id: feedbackDocId,
        parsed_feedback: parsed,
      })
    }

    return NextResponse.json({
      item_name: item.name,
      feedback_doc_id: feedbackDocId,
      feedback_doc_content: feedbackDocContent,
      parsed_feedback: parsed,
      review: existing ? {
        generated_summary: existing.generated_summary,
        contradiction_note: existing.contradiction_note,
        summary_draft: existing.summary_draft,
        synced_to_monday: existing.synced_to_monday,
        synced_at: existing.synced_at,
      } : null,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch feedback doc'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
