/**
 * Queue all Monday items for a given batch (e.g. April 2026).
 * Run: npx tsx src/scripts/queue-batch.ts
 * Optional: BATCH=2026-04 BOARD=18404406006 npx tsx src/scripts/queue-batch.ts
 */

import 'dotenv/config'
import { readMondayBoardItems } from '../services/mondayBoardReader.js'
import type { MondayBoardItemRow } from '../services/mondayBoardReader.js'
import { parseBatchToCanonical } from '../domain/routing/batchToFile.js'
import { queueMondayItem } from '../api/webhooks/monday.js'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? process.env.BOARD ?? '18404406006'
const BATCH_CANONICAL = process.env.BATCH ?? '2026-04'

function getBatchRaw(item: MondayBoardItemRow): string | null {
  for (const cv of item.column_values ?? []) {
    const title = (cv.title ?? (cv as { column?: { title?: string } }).column?.title ?? '').toLowerCase().replace(/\s+/g, '_')
    if (title === 'batch' || title === 'batch_name') {
      const text = cv.text ?? ''
      if (text.trim()) return text.trim()
      if (cv.value) {
        try {
          const parsed = JSON.parse(cv.value)
          if (parsed?.text) return String(parsed.text).trim()
        } catch {
          // ignore
        }
      }
      return null
    }
  }
  return null
}

async function main() {
  console.log(`\n=== Fetching board ${BOARD_ID} ===\n`)
  const items = await readMondayBoardItems(BOARD_ID)
  console.log(`Total items: ${items.length}`)

  const april: MondayBoardItemRow[] = []
  for (const item of items) {
    const batchRaw = getBatchRaw(item)
    const parsed = batchRaw ? parseBatchToCanonical(batchRaw) : null
    if (parsed?.canonicalKey === BATCH_CANONICAL) {
      april.push(item)
    }
  }
  console.log(`Items in batch ${BATCH_CANONICAL}: ${april.length}`)
  if (april.length === 0) {
    console.log('Nothing to queue.')
    process.exit(0)
  }

  let ok = 0
  let failed = 0
  for (const item of april) {
    process.stdout.write(`Queueing ${item.name} (${item.id})... `)
    try {
      const result = await queueMondayItem(BOARD_ID, item.id)
      if (result.outcome === 'queued' || result.outcome === 'skipped') {
        console.log(result.outcome)
        ok++
      } else {
        console.log('failed:', result.message ?? result.error)
        failed++
      }
    } catch (e) {
      console.log('error:', e instanceof Error ? e.message : e)
      failed++
    }
  }
  console.log(`\nDone. Queued/skipped: ${ok}, failed: ${failed}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
