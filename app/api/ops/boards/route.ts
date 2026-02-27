import { NextResponse } from 'next/server'
import {
  listBoardSummaries,
  createBoard,
  type CreateBoardInput,
} from '@/src/services/opsBoardStore'

export async function GET() {
  const boards = await listBoardSummaries()
  return NextResponse.json({ boards })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const mondayBoardId = String(body.mondayBoardId ?? '').trim()
    const boardName = String(body.boardName ?? '').trim()

    if (!mondayBoardId || !boardName) {
      return NextResponse.json(
        { error: 'mondayBoardId and boardName are required' },
        { status: 400 }
      )
    }

    if (boardName.length > 255) {
      return NextResponse.json(
        { error: 'boardName must be 255 characters or fewer' },
        { status: 400 }
      )
    }

    const input: CreateBoardInput = {
      mondayBoardId,
      boardName,
      figmaProjectId: body.figmaProjectId ?? null,
      figmaProjectName: body.figmaProjectName ?? null,
      description: body.description ?? null,
      autoQueue: body.autoQueue ?? true,
      eligibleStatuses: Array.isArray(body.eligibleStatuses)
        ? body.eligibleStatuses.filter((s: unknown) => typeof s === 'string' && s.trim())
        : undefined,
    }

    const board = await createBoard(input)
    if (!board) {
      return NextResponse.json(
        { error: 'Failed to create board (may already exist)' },
        { status: 409 }
      )
    }
    return NextResponse.json({ board }, { status: 201 })
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }
}
