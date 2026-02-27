import { NextResponse } from 'next/server'
import { getBoard, getBoardItems, updateItemPipelineStatus } from '@/src/services/opsBoardStore'
import { queueMondayItem } from '@/src/api/webhooks/monday'

/**
 * Queue all eligible items for a board by feeding them through
 * the same pipeline the webhook uses (fetch item, map, enqueue KV job).
 */
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params

  const board = await getBoard(boardId)
  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }

  const eligibleItems = await getBoardItems(boardId, { pipelineStatus: 'eligible' })
  if (eligibleItems.length === 0) {
    return NextResponse.json({ queued: 0, message: 'No eligible items' })
  }

  let queued = 0
  const errors: string[] = []

  for (const item of eligibleItems) {
    try {
      const result = await queueMondayItem(
        item.monday_board_id,
        item.monday_item_id,
        { idempotencySuffix: `ops-queue-${Date.now()}` }
      )

      if (result.outcome === 'queued' || result.outcome === 'created') {
        await updateItemPipelineStatus(
          item.monday_item_id,
          item.monday_board_id,
          'queued',
          {
            queued_at: new Date().toISOString(),
            figma_file_key: result.job?.figmaFileKey ?? undefined,
          }
        )
        queued++
      } else if (result.outcome === 'skipped') {
        await updateItemPipelineStatus(item.monday_item_id, item.monday_board_id, 'synced')
      } else {
        errors.push(`Item ${item.monday_item_id}: ${result.message}`)
        await updateItemPipelineStatus(item.monday_item_id, item.monday_board_id, 'failed')
      }
    } catch (err) {
      errors.push(`Item ${item.monday_item_id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  return NextResponse.json({ queued, total: eligibleItems.length, errors })
}
