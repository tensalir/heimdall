import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { upsertSync } from '@/src/services/briefingSyncStore'
import { updateItemPipelineStatus } from '@/src/services/opsBoardStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ops/backfill-syncs?file_key=X
 * Reads pages from a Figma file via the Figma API, matches page names against
 * ops_board_items, and creates briefing_syncs records + updates pipeline_status
 * for any items that already exist in Figma but are missing sync records.
 */
export async function POST(request: NextRequest) {
  const fileKey = new URL(request.url).searchParams.get('file_key')
  if (!fileKey) {
    return NextResponse.json({ error: 'file_key query param required' }, { status: 400 })
  }

  const figmaToken = process.env.FIGMA_ACCESS_TOKEN
  if (!figmaToken) {
    return NextResponse.json({ error: 'FIGMA_ACCESS_TOKEN not set' }, { status: 500 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  const figmaRes = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
    headers: { 'X-Figma-Token': figmaToken },
  })
  if (!figmaRes.ok) {
    const text = await figmaRes.text()
    return NextResponse.json({ error: `Figma API error: ${figmaRes.status} ${text}` }, { status: 502 })
  }
  const figmaData = await figmaRes.json() as {
    document?: { children?: Array<{ id: string; name: string; type: string }> }
  }

  const figmaPages = (figmaData.document?.children ?? [])
    .filter(c => c.type === 'CANVAS')
    .map(c => ({ id: c.id, name: c.name }))

  const figmaPageNames = new Set(figmaPages.map(p => p.name))
  const figmaPageMap = new Map(figmaPages.map(p => [p.name, p.id]))

  const { data: boardItems, error } = await db
    .from('ops_board_items')
    .select('monday_item_id, monday_board_id, item_name, experiment_name, batch_canonical, pipeline_status, figma_file_key')

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let backfilled = 0
  let alreadySynced = 0
  const matched: string[] = []

  for (const item of boardItems ?? []) {
    const pageName = item.experiment_name ?? item.item_name
    if (!figmaPageNames.has(pageName)) continue

    const pageId = figmaPageMap.get(pageName) ?? null

    if (item.pipeline_status === 'synced' && item.figma_file_key === fileKey) {
      alreadySynced++
      continue
    }

    try {
      await upsertSync({
        mondayItemId: item.monday_item_id,
        mondayBoardId: item.monday_board_id,
        mondayItemName: pageName,
        batchCanonical: item.batch_canonical ?? '',
        figmaFileKey: fileKey,
        figmaPageId: pageId,
        figmaPageName: pageName,
      })

      await updateItemPipelineStatus(item.monday_item_id, item.monday_board_id, 'synced', {
        figma_file_key: fileKey,
        figma_page_id: pageId ?? undefined,
        synced_at: new Date().toISOString(),
      })

      backfilled++
      matched.push(pageName)
    } catch {
      // skip individual failures
    }
  }

  return NextResponse.json({
    figma_pages: figmaPages.length,
    board_items: boardItems?.length ?? 0,
    backfilled,
    already_synced: alreadySynced,
    matched,
  })
}
