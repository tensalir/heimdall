import { NextResponse } from 'next/server'
import { captureVersion, type CapturePhase, type OperationKind, type VersionSource } from '@/src/services/briefingVersionStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/plugin/capture-version
 * Called by the plugin before/after mutations to record page snapshots.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()

    const mondayItemId = String(body.mondayItemId ?? '').trim()
    const mondayBoardId = String(body.mondayBoardId ?? '').trim()
    const figmaFileKey = String(body.figmaFileKey ?? '').trim()

    if (!mondayItemId || !figmaFileKey) {
      return NextResponse.json(
        { error: 'mondayItemId and figmaFileKey are required' },
        { status: 400 }
      )
    }

    const version = await captureVersion({
      mondayItemId,
      mondayBoardId,
      batchCanonical: body.batchCanonical ?? null,
      figmaFileKey,
      figmaPageId: body.figmaPageId ?? null,
      figmaPageName: body.figmaPageName ?? null,
      capturePhase: (body.capturePhase ?? 'pre_write') as CapturePhase,
      operationKind: (body.operationKind ?? 'update') as OperationKind,
      source: (body.source ?? 'plugin_sync') as VersionSource,
      idempotencyKey: body.idempotencyKey ?? null,
      pageSnapshot: body.pageSnapshot ?? {},
      inputSnapshot: body.inputSnapshot ?? {},
      mondaySnapshot: body.mondaySnapshot ?? {},
      writeMetadata: body.writeMetadata ?? {},
      pageHash: body.pageHash ?? null,
      syncId: body.syncId ?? null,
    })

    if (!version) {
      return NextResponse.json({ error: 'Failed to capture version' }, { status: 500 })
    }

    return NextResponse.json(
      { ok: true, versionId: version.id, versionNumber: version.version_number },
      {
        status: 200,
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
