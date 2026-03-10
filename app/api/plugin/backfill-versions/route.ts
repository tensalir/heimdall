import { NextResponse } from 'next/server'
import { captureVersion } from '@/src/services/briefingVersionStore'
import { getSyncsForFile } from '@/src/services/briefingSyncStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/plugin/backfill-versions
 * Called by the plugin to create version-1 snapshots for all synced pages
 * in a file that do not yet have any version history.
 * Body: { figmaFileKey, pages: [{ pageId, pageName, mondayItemId, snapshot }] }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const figmaFileKey = String(body.figmaFileKey ?? '').trim()
    const pages = Array.isArray(body.pages) ? body.pages : []

    if (!figmaFileKey || pages.length === 0) {
      return NextResponse.json({ error: 'figmaFileKey and pages[] are required' }, { status: 400 })
    }

    const syncs = await getSyncsForFile(figmaFileKey)
    const syncMap = new Map(syncs.map(s => [s.monday_item_id, s]))

    let created = 0
    let skipped = 0

    for (const page of pages) {
      const mondayItemId = String(page.mondayItemId ?? '').trim()
      if (!mondayItemId) { skipped++; continue }

      const sync = syncMap.get(mondayItemId)

      const version = await captureVersion({
        mondayItemId,
        mondayBoardId: sync?.monday_board_id ?? '',
        batchCanonical: sync?.batch_canonical ?? null,
        figmaFileKey,
        figmaPageId: page.pageId ?? null,
        figmaPageName: page.pageName ?? null,
        capturePhase: 'backfill',
        operationKind: 'repair_backfill',
        source: 'admin_backfill',
        pageSnapshot: page.snapshot ?? {},
        writeMetadata: { backfilledAt: new Date().toISOString() },
        syncId: sync?.id ?? null,
      })

      if (version) { created++ } else { skipped++ }
    }

    return NextResponse.json(
      { ok: true, created, skipped, total: pages.length },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
