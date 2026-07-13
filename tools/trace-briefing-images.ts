/**
 * End-to-end trace of the briefing image pipeline for real Monday items:
 *   item -> getMondayItem -> getDocImages + extractImageAttachments
 *        -> mondayItemToBriefing -> briefing.images
 * so we can see exactly what would land in job.images at the moment createOrQueueFigmaPage runs.
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

const ITEMS = [
  '12082185986', // has embedded image blocks (verified above)
  '12251808504', // brief column value was {"files":[]} (empty)
  '11720285551',
  '12052151005',
]

async function main(): Promise<void> {
  for (const itemId of ITEMS) {
    console.log(`\n===== ITEM ${itemId} =====`)
    const item = await getMondayItem(BOARD_ID, itemId)
    if (!item) {
      console.log('  NOT FOUND')
      continue
    }
    console.log(`  name: ${item.name}`)
    console.log(`  assets count: ${item.assets?.length ?? 0}`)
    for (const a of item.assets ?? []) {
      console.log(`    - asset ${a.id} ext=${a.file_extension ?? '-'} name=${a.name} public_url=${a.public_url ? 'yes' : 'no'}`)
    }

    const col = columnMap(item)
    const briefRaw = getCol(col, 'brief', 'briefing', 'doc')
    const docId = getDocIdFromColumnValue(briefRaw ?? null)
    console.log(`  brief raw: ${briefRaw?.slice(0, 100) ?? '(none)'}`)
    console.log(`  doc id: ${docId ?? '(none)'}`)

    let docImages: Awaited<ReturnType<typeof getDocImages>> = []
    let refLinks: Awaited<ReturnType<typeof getDocReferenceLinks>> = []
    if (docId) {
      docImages = await getDocImages(docId)
      refLinks = await getDocReferenceLinks(docId)
    }
    console.log(`  getDocImages(): ${docImages.length}`)
    for (const img of docImages) {
      console.log(`    - ${img.name} assetId=${img.assetId ?? '-'} url=${img.url.slice(0, 60)}`)
    }
    console.log(`  getDocReferenceLinks(): ${refLinks.length}`)

    const columnImages = extractImageAttachments(item)
    console.log(`  extractImageAttachments(): ${columnImages.length}`)
    for (const img of columnImages) {
      console.log(`    - ${img.name} assetId=${img.assetId ?? '-'} source=${img.source}`)
    }

    const briefing = mondayItemToBriefing(item, { docImages })
    if (!briefing) {
      console.log(`  briefing: NULL (bad batch / not eligible)`)
      continue
    }
    console.log(`  briefing.images count: ${briefing.images?.length ?? 0}`)
    for (const img of briefing.images ?? []) {
      console.log(`    * ${img.name} assetId=${img.assetId ?? '-'} source=${img.source} url=${img.url.slice(0, 60)}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
