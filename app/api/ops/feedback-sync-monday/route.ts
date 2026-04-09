import { NextRequest, NextResponse } from 'next/server'
import { requireFeedbackReviewer } from '@/lib/route-auth'
import { mondayGraphql } from '@/src/integrations/monday/client'
import { getMondayItem } from '@/src/api/webhooks/monday'
import { columnMap, getCol } from '@/src/integrations/monday/client'
import { getDocIdFromColumnValue } from '@/src/integrations/monday/docReader'
import { getReview, markSynced } from '@/src/services/opsFeedbackStore'

export const dynamic = 'force-dynamic'

/**
 * Resolve the Monday column ID for the status column by scanning the item's column_values.
 */
function findStatusColumnId(
  item: { column_values?: Array<{ id: string; title?: string; column?: { title: string } }> }
): string | null {
  for (const cv of item.column_values ?? []) {
    const title = (cv.title ?? cv.column?.title ?? '').toLowerCase()
    if (title === 'status' || title === 'brief_status' || title === 'brief status') {
      return cv.id
    }
  }
  return null
}

/**
 * Resolve the Monday column ID for the feedback doc column.
 */
function findFeedbackDocColumnId(
  item: { column_values?: Array<{ id: string; title?: string; column?: { title: string } }> }
): string | null {
  for (const cv of item.column_values ?? []) {
    const title = (cv.title ?? cv.column?.title ?? '').toLowerCase()
    if (title === 'feedback' || title === 'feedback_doc' || title === 'creative_feedback' || title === 'fb_doc') {
      return cv.id
    }
  }
  return null
}

/**
 * POST /api/ops/feedback-sync-monday
 * Body: { item_id, board_id, summary }
 * Writes the finalized summary into the Monday feedback doc and sets the item status to "Feedback".
 */
export async function POST(req: NextRequest) {
  const auth = await requireFeedbackReviewer(req)
  if (auth.error) return auth.error

  let body: { item_id?: string; board_id?: string; summary?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { item_id, board_id, summary } = body
  if (!item_id || !board_id || !summary?.trim()) {
    return NextResponse.json({ error: 'item_id, board_id, and summary are required' }, { status: 400 })
  }

  try {
    const item = await getMondayItem(board_id, item_id)
    if (!item) {
      return NextResponse.json({ error: 'Monday item not found' }, { status: 404 })
    }

    const col = columnMap(item)
    const feedbackRaw = getCol(col, 'feedback', 'feedback_doc', 'creative_feedback', 'fb_doc')
    const feedbackDocId = getDocIdFromColumnValue(feedbackRaw ?? null)
    const feedbackColId = findFeedbackDocColumnId(item)
    const statusColId = findStatusColumnId(item)

    // Write summary to the feedback doc
    if (feedbackDocId) {
      const docContent = `# Summarized Feedback\n\n*Generated ${new Date().toISOString().slice(0, 10)}*\n\n${summary}`
      await mondayGraphql<{ create_doc?: { id: string } }>(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $title: String!, $content: String!) {
          create_doc(
            board_id: $boardId
            item_id: $itemId
            column_id: $columnId
            title: $title
            content: $content
          ) {
            id
          }
        }`,
        {
          boardId: board_id,
          itemId: item_id,
          columnId: feedbackColId ?? '',
          title: `Feedback Summary: ${item.name}`,
          content: docContent,
        }
      )
    } else if (feedbackColId) {
      const docContent = `# Summarized Feedback\n\n*Generated ${new Date().toISOString().slice(0, 10)}*\n\n${summary}`
      await mondayGraphql<{ create_doc?: { id: string } }>(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $title: String!, $content: String!) {
          create_doc(
            board_id: $boardId
            item_id: $itemId
            column_id: $columnId
            title: $title
            content: $content
          ) {
            id
          }
        }`,
        {
          boardId: board_id,
          itemId: item_id,
          columnId: feedbackColId,
          title: `Feedback Summary: ${item.name}`,
          content: docContent,
        }
      )
    }

    // Update status to "Feedback"
    if (statusColId) {
      await mondayGraphql<{ change_simple_column_value?: { id: string } }>(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
          change_simple_column_value(
            board_id: $boardId
            item_id: $itemId
            column_id: $columnId
            value: $value
          ) {
            id
          }
        }`,
        {
          boardId: board_id,
          itemId: item_id,
          columnId: statusColId,
          value: 'Feedback',
        }
      )
    }

    // Mark synced in local store
    await markSynced(item_id, board_id, summary, 'Feedback')

    return NextResponse.json({
      ok: true,
      item_id,
      board_id,
      synced_at: new Date().toISOString(),
      doc_written: !!(feedbackDocId || feedbackColId),
      status_updated: !!statusColId,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to sync to Monday'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
