import { NextResponse } from 'next/server'
import { getJobByIdempotencyKey, updateJobState } from '@/lib/kv'
import { logger } from '@/lib/logger'
import { upsertSync, appendImportEvent } from '@/src/services/briefingSyncStore'
import { updateItemPipelineStatus } from '@/src/services/opsBoardStore'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const idempotencyKey = String(body.idempotencyKey ?? body.idempotency_key ?? '')
    const figmaPageId = String(body.figmaPageId ?? body.page_id ?? '')
    const figmaFileUrl = String(body.figmaFileUrl ?? body.file_url ?? '')
    const pluginOutcome = String(body.outcome ?? 'created')
    
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'idempotencyKey required' }, { status: 400 })
    }
    
    const job = await getJobByIdempotencyKey(idempotencyKey)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    
    await updateJobState(job.id, 'completed', { figmaPageId, figmaFileUrl })
    if (job.figmaFileKey && job.mondayItemId && figmaPageId) {
      await upsertSync({
        mondayItemId: job.mondayItemId,
        mondayBoardId: job.mondayBoardId,
        mondayItemName: job.experimentPageName ?? job.mondayItemId,
        batchCanonical: job.batchCanonical,
        figmaFileKey: job.figmaFileKey,
        figmaPageId,
        figmaPageName: job.experimentPageName ?? null,
      })
      await appendImportEvent({
        mondayItemId: job.mondayItemId,
        mondayBoardId: job.mondayBoardId,
        mondayItemName: job.experimentPageName ?? job.mondayItemId,
        batchCanonical: job.batchCanonical,
        figmaFileKey: job.figmaFileKey,
        figmaPageId,
        figmaPageName: job.experimentPageName ?? null,
        idempotencyKey: job.idempotencyKey,
        source: 'plugin_sync',
        outcome: 'completed',
        reason: pluginOutcome === 'updated' ? 'Updated existing page' : 'Created new page',
      })
    }

    if (job.mondayItemId && job.mondayBoardId) {
      await updateItemPipelineStatus(job.mondayItemId, job.mondayBoardId, 'synced', {
        figma_file_key: job.figmaFileKey ?? undefined,
        figma_page_id: figmaPageId || undefined,
        figma_page_url: figmaFileUrl || undefined,
        synced_at: new Date().toISOString(),
      })
    }

    logger.info('figma', 'Job marked completed', {
      jobId: job.id,
      idempotencyKey,
      figmaPageId,
      pluginOutcome,
    })

    return NextResponse.json(
      { ok: true, message: 'Job marked as completed' },
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

export const dynamic = 'force-dynamic'
