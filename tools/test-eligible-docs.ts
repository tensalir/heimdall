/**
 * Run the exact backend pipeline (getDocImages + mondayItemToBriefing)
 * against currently-eligible items so we see if job.images comes out empty.
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getMondayItem } from '../src/api/webhooks/monday.ts'
import { columnMap, getCol, extractImageAttachments } from '../src/integrations/monday/client.ts'
import { getDocImages, getDocIdFromColumnValue, getDocReferenceLinks } from '../src/integrations/monday/docReader.ts'
import { mondayItemToBriefing } from '../src/domain/briefing/mondayToBriefing.ts'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'

// Eligible items with embedded image blocks (per find-eligible-with-images.ts)
const ITEMS = [
  '12301452257', // 1 image block
  '12378297816', // 5 image blocks
  '12378587231', // 2 image blocks
  '12378588972', // 2 image blocks
]

async function main(): Promise<void> {
  for (const itemId of ITEMS) {
    console.log(`\n===== ${itemId} =====`)
    const item = await getMondayItem(BOARD_ID, itemId)
    if (!item) {
      console.log('  not found')
      continue
    }
    console.log(`  name: ${item.name}`)

    const col = columnMap(item)
    const briefRaw = getCol(col, 'brief', 'briefing', 'doc')
    const docId = getDocIdFromColumnValue(briefRaw ?? null)
    console.log(`  briefRaw: ${briefRaw?.slice(0, 90)}`)
    console.log(`  docId: ${docId ?? '(none)'}`)

    if (!docId) {
      console.log(`  briefing.images would be: 0 (no doc)`)
      continue
    }

    const docImages = await getDocImages(docId)
    const refLinks = await getDocReferenceLinks(docId)
    const columnImages = extractImageAttachments(item)

    console.log(`  getDocImages(): ${docImages.length}`)
    for (const img of docImages) {
      console.log(`    - ${img.name}  assetId=${img.assetId ?? '-'}`)
    }
    console.log(`  getDocReferenceLinks(): ${refLinks.length}`)
    console.log(`  extractImageAttachments(): ${columnImages.length}`)

    const briefing = mondayItemToBriefing(item, { docImages })
    if (!briefing) {
      console.log(`  briefing: NULL (batch parse failed?)`)
      continue
    }
    console.log(`  briefing.images: ${briefing.images?.length ?? 0}   <-- this becomes job.images`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
