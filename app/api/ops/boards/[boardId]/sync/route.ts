import { NextResponse } from 'next/server'
import { syncBoardItems } from '@/src/services/opsBoardStore'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ boardId: string }> }
) {
  const { boardId } = await params
  const result = await syncBoardItems(boardId)

  if (result.errors.length && result.upserted === 0) {
    return NextResponse.json(
      { error: result.errors[0], result },
      { status: 502 }
    )
  }

  return NextResponse.json({ result })
}
