import { NextRequest, NextResponse } from 'next/server'
import { readMondayBoardItemsWithMeta } from '@/src/services/mondayBoardReader'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/board-items?board_id=18404406006
 * Returns items from a Monday board for the import picker.
 * Column values are keyed by title (e.g. batch, format, product, agency).
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const { searchParams } = new URL(req.url)
  const boardId = searchParams.get('board_id')?.trim()
  if (!boardId) {
    return NextResponse.json({ error: 'board_id query required' }, { status: 400 })
  }

  try {
    const { items, boardFound } = await readMondayBoardItemsWithMeta(boardId)
    if (!boardFound) {
      return NextResponse.json(
        { error: 'Board not found or no access' },
        { status: 404 }
      )
    }

    const simplified = items.map((item) => {
      const columnValues: Record<string, string> = {}
      for (const cv of item.column_values) {
        const title = (cv.title ?? cv.id).toLowerCase().trim().replace(/\s+/g, '_')
        const text = (cv.text ?? '').trim()
        if (title && text) columnValues[title] = text
      }
      return {
        id: item.id,
        name: item.name,
        group: item.group?.title ?? null,
        columnValues,
      }
    })

    return NextResponse.json({ items: simplified })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to read board'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
