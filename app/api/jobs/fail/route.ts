import { NextResponse } from 'next/server'
import { getJobByIdempotencyKey, updateJobState } from '@/lib/kv'
import { logger } from '@/lib/logger'
import { appendImportEvent } from '@/src/services/briefingSyncStore'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const idempotencyKey = String(body.idempotencyKey ?? body.idempotency_key ?? '')
    const errorCode = String(body.errorCode ?? body.error_code ?? 'unknown')
    
    if (!idempotencyKey) {
      return NextResponse.json({ error: 'idempotencyKey required' }, { status: 400 })
    }
    
    const job = await getJobByIdempotencyKey(idempotencyKey)
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }
    
    await updateJobState(job.id, 'failed', { errorCode })

    if (job.figmaFileKey && job.mondayItemId) {
      await appendImportEvent({
        mondayItemId: job.mondayItemId,
        mondayBoardId: job.mondayBoardId,
        mondayItemName: job.experimentPageName ?? job.mondayItemId,
        batchCanonical: job.batchCanonical,
        figmaFileKey: job.figmaFileKey,
        idempotencyKey: job.idempotencyKey,
        source: 'plugin_sync',
        outcome: 'failed',
        errorCode,
      })
    }

    logger.warn('figma', 'Job marked failed', {
      jobId: job.id,
      idempotencyKey,
      errorCode,
    })

    return NextResponse.json(
      { ok: true, message: 'Job marked as failed' },
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
