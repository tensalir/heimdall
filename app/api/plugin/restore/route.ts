import { NextResponse } from 'next/server'
import { getVersionById } from '@/src/services/briefingVersionStore'
import {
  createRestoreRun,
  addRestoreItem,
  updateRestoreRunStatus,
  updateRestoreItemStatus,
  getPendingRestoreItems,
} from '@/src/services/briefingRestoreStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/plugin/restore
 * Queue a restore-as-copy for a specific version.
 * Body: { versionId, figmaFileKey, restoreMode? }
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const versionId = String(body.versionId ?? '').trim()
    const figmaFileKey = String(body.figmaFileKey ?? '').trim()
    const restoreMode = body.restoreMode ?? 'restore_copy'

    if (!versionId) {
      return NextResponse.json({ error: 'versionId is required' }, { status: 400 })
    }

    const version = await getVersionById(versionId)
    if (!version) {
      return NextResponse.json({ error: 'Version not found' }, { status: 404 })
    }

    const run = await createRestoreRun({
      selectionMode: 'single_version',
      figmaFileKey: figmaFileKey || version.figma_file_key,
      params: { versionId, restoreMode },
    })
    if (!run) {
      return NextResponse.json({ error: 'Failed to create restore run' }, { status: 500 })
    }

    const item = await addRestoreItem({
      restoreRunId: run.id,
      syncId: version.sync_id ?? undefined,
      targetVersionId: versionId,
      mondayItemId: version.monday_item_id,
      figmaFileKey: version.figma_file_key,
      figmaPageId: version.figma_page_id ?? undefined,
      figmaPageName: version.figma_page_name ?? undefined,
      restoreMode,
    })
    if (!item) {
      return NextResponse.json({ error: 'Failed to create restore item' }, { status: 500 })
    }

    return NextResponse.json(
      {
        ok: true,
        restoreRunId: run.id,
        restoreItemId: item.id,
        targetVersion: {
          id: version.id,
          versionNumber: version.version_number,
          pageName: version.figma_page_name,
          capturePhase: version.capture_phase,
          operationKind: version.operation_kind,
          createdAt: version.created_at,
        },
      },
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

/**
 * GET /api/plugin/restore?figmaFileKey=X
 * Fetch pending restore items for the current file so the plugin can execute them.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const figmaFileKey = searchParams.get('figmaFileKey')

  if (!figmaFileKey) {
    return NextResponse.json({ error: 'figmaFileKey is required' }, { status: 400 })
  }

  const items = await getPendingRestoreItems(figmaFileKey)

  const enriched = await Promise.all(
    items.map(async (item) => {
      const version = await getVersionById(item.target_version_id)
      return {
        ...item,
        targetVersion: version
          ? {
              id: version.id,
              versionNumber: version.version_number,
              pageSnapshot: version.page_snapshot,
              inputSnapshot: version.input_snapshot,
              capturePhase: version.capture_phase,
              operationKind: version.operation_kind,
            }
          : null,
      }
    })
  )

  return NextResponse.json(
    { items: enriched },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  )
}

/**
 * PATCH /api/plugin/restore
 * Update a restore item's status after the plugin executes the restore.
 * Body: { restoreItemId, status, resultPageId?, errorCode? }
 */
export async function PATCH(request: Request) {
  try {
    const body = await request.json()
    const restoreItemId = String(body.restoreItemId ?? '').trim()
    const status = String(body.status ?? '').trim()

    if (!restoreItemId || !status) {
      return NextResponse.json({ error: 'restoreItemId and status are required' }, { status: 400 })
    }

    const ok = await updateRestoreItemStatus(restoreItemId, status as any, {
      resultPageId: body.resultPageId,
      errorCode: body.errorCode,
    })

    if (body.restoreRunId && (status === 'completed' || status === 'failed')) {
      await updateRestoreRunStatus(body.restoreRunId, status as any, {
        resultSummary: body.resultSummary,
        error: body.errorCode,
      })
    }

    return NextResponse.json(
      { ok },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'PATCH, OPTIONS',
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
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
