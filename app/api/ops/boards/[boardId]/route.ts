import { NextResponse } from 'next/server'
import { getBoard, getBoardItems, deleteBoard, updateBoard } from '@/src/services/opsBoardStore'
import type { PipelineStatus } from '@/src/services/opsBoardStore'
import { getSyncedFeedbackItemIds } from '@/src/services/opsFeedbackStore'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params
  const board = await getBoard(boardId)
  if (!board) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }

  const url = new URL(_request.url)
  const statusFilter = url.searchParams.get('status') as PipelineStatus | null
  const [items, syncedFeedbackIds] = await Promise.all([
    getBoardItems(boardId, { pipelineStatus: statusFilter ?? undefined }),
    getSyncedFeedbackItemIds(board.monday_board_id),
  ])

  return NextResponse.json({
    board,
    items,
    feedbackSyncedItemIds: [...syncedFeedbackIds],
  })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params
  try {
    const body = await request.json()
    const patch: Record<string, unknown> = {}

    if (body.boardName !== undefined) patch.board_name = String(body.boardName).trim()
    if (body.figmaProjectId !== undefined) patch.figma_project_id = body.figmaProjectId
    if (body.figmaProjectName !== undefined) patch.figma_project_name = body.figmaProjectName
    if (body.description !== undefined) patch.description = body.description
    if (body.autoQueue !== undefined) patch.auto_queue = Boolean(body.autoQueue)
    if (Array.isArray(body.eligibleStatuses)) patch.eligible_statuses = body.eligibleStatuses

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const board = await updateBoard(boardId, patch as any)
    if (!board) {
      return NextResponse.json({ error: 'Board not found' }, { status: 404 })
    }
    return NextResponse.json({ board })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params
  const ok = await deleteBoard(boardId)
  if (!ok) {
    return NextResponse.json({ error: 'Board not found' }, { status: 404 })
  }
  return NextResponse.json({ deleted: true })
}
