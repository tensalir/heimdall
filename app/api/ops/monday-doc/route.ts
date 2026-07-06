import { NextResponse } from 'next/server'
import { getMondayItem } from '@/src/api/webhooks/monday'
import { columnMap, getCol } from '@/src/integrations/monday/client'
import { getDocContent, getDocIdFromColumnValue } from '@/src/integrations/monday/docReader'

export const dynamic = 'force-dynamic'

/**
 * GET /api/ops/monday-doc?item_id=X&board_id=Y
 * Fetches a Monday item's briefing doc content for preview.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const itemId = url.searchParams.get('item_id')
  const boardId = url.searchParams.get('board_id')

  if (!itemId) {
    return NextResponse.json({ error: 'item_id is required' }, { status: 400 })
  }

  try {
    const item = await getMondayItem(boardId ?? '', itemId)
    if (!item) {
      return NextResponse.json({ error: 'Monday item not found' }, { status: 404 })
    }

    const col = columnMap(item)
    const briefRaw = getCol(col, 'brief', 'briefing', 'doc')
    const docId = getDocIdFromColumnValue(briefRaw ?? null)
    const docContent = docId ? await getDocContent(docId, { itemId }) : null

    const columns: Record<string, string> = {}
    for (const [k, v] of Object.entries(col)) {
      if (v != null) columns[k] = String(v)
    }

    return NextResponse.json({
      item_name: item.name,
      doc_id: docId,
      doc_content: docContent,
      columns,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to fetch Monday doc'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
