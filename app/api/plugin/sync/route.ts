import { NextRequest, NextResponse } from 'next/server'
import { queueMondayItem } from '@/src/api/webhooks/monday'
import {
  upsertSync,
  hasSuccessfulImport,
  appendImportEvent,
} from '@/src/services/briefingSyncStore'
export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '9147622374'
const MAX_CONCURRENCY = 3

function buildSyncFileRef(fileKey: string, fileName: string): string {
  const key = fileKey.trim()
  if (key) return key
  const name = fileName.trim().toLowerCase()
  if (!name) return ''
  // Figma plugin sometimes cannot read fileKey in certain contexts; fileName fallback
  // keeps sync/import audit records tied to the opened monthly file.
  return `name:${name}`
}

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length)
  let nextIdx = 0
  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      try {
        results[idx] = { status: 'fulfilled', value: await fn(items[idx]) }
      } catch (reason) {
        results[idx] = { status: 'rejected', reason }
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

/**
 * POST /api/plugin/sync
 * Body: { fileKey?: string, items: Array<{ id: string, name: string, batch: string }> }
 * Queues items concurrently (max 3 at a time) via queueMondayItem.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const fileKey = String(body.fileKey ?? '').trim()
    const fileName = String(body.fileName ?? '').trim()
    const syncFileRef = buildSyncFileRef(fileKey, fileName)
    const items = Array.isArray(body.items) ? body.items : []

    if (items.length === 0) {
      return NextResponse.json({ queued: 0, skipped: 0, jobs: [] })
    }

    const validItems = items.filter((it: { id?: string }) => String(it.id ?? '').trim())

    const results = await mapConcurrent(validItems, MAX_CONCURRENCY, async (it: { id?: string; name?: string; batch?: string }) => {
      const itemId = String(it.id ?? '').trim()
      const name = String(it.name ?? '').trim()
      const batch = String(it.batch ?? '').trim()

      if (fileKey) {
        const alreadyImported = await hasSuccessfulImport(itemId, fileKey)
        if (alreadyImported) {
          await appendImportEvent({
            mondayItemId: itemId,
            mondayBoardId: BOARD_ID,
            mondayItemName: name,
            batchCanonical: batch,
            figmaFileKey: syncFileRef,
            source: 'plugin_sync',
            outcome: 'skipped_already_imported',
            reason: 'Already successfully imported into this file',
          })
          return { itemId, name, batch, result: { outcome: 'skipped_already_imported' as const, message: 'Already imported' }, skipped: true }
        }
      }

      const result = await queueMondayItem(BOARD_ID, itemId, {
        idempotencySuffix: `plugin-${Date.now()}-${itemId}`,
        disableAiMapping: false,
        figmaFileKeyOverride: syncFileRef || undefined,
      })

      if (syncFileRef && (result.outcome === 'queued' || result.outcome === 'skipped')) {
        await appendImportEvent({
          mondayItemId: itemId,
          mondayBoardId: BOARD_ID,
          mondayItemName: name,
          batchCanonical: batch,
          figmaFileKey: syncFileRef,
          idempotencyKey: null,
          source: 'plugin_sync',
          outcome: 'queued',
          reason: result.outcome === 'skipped' ? 'Idempotency hit (already queued)' : undefined,
        })
      }

      return { itemId, name, batch, result, skipped: false }
    })

    const jobs: Array<{ id: string; itemName: string }> = []
    let queued = 0
    let skipped = 0

    const syncPromises: Promise<void>[] = []
    for (const settled of results) {
      if (settled.status === 'rejected') {
        skipped++
        continue
      }
      const { itemId, name, batch, result, skipped: alreadyImported } = settled.value
      if (alreadyImported || result.outcome === 'skipped_already_imported') {
        skipped++
        continue
      }
      if (result.outcome === 'queued' || result.outcome === 'skipped') {
        queued++
        if (result.job) jobs.push({ id: result.job.id, itemName: result.job.experimentPageName ?? name })
        if (syncFileRef) {
          syncPromises.push(
            upsertSync({
              mondayItemId: itemId,
              mondayBoardId: BOARD_ID,
              mondayItemName: name,
              batchCanonical: batch,
              figmaFileKey: syncFileRef,
              mondaySnapshot: { name, batch, itemId },
            }).then(() => {})
          )
        }
      } else {
        skipped++
      }
    }

    await Promise.allSettled(syncPromises)

    return NextResponse.json({
      queued,
      skipped,
      jobs,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
