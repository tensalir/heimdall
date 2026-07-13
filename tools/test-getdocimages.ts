/**
 * Directly invoke getDocImages() against real Monday docs and see what it returns,
 * so we can tell whether the extraction is silently returning 0 despite valid blocks.
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getDocImages } from '../src/integrations/monday/docReader.ts'

// Args: docId or docId:itemId pairs. With an itemId, getDocImages can use the
// item-traversal fallback for docs invisible to docs(object_ids).
const args = process.argv.slice(2)
const TARGETS: Array<{ docId: string; itemId?: string }> = args.length
  ? args.map((a) => {
      const [docId, itemId] = a.split(':')
      return { docId, itemId }
    })
  : [
      { docId: '18414414717' }, // EXP-AP1 — 6 image blocks (per inspect script)
      { docId: '18407336736' }, // no image blocks
      { docId: '18408115937' },
      { docId: '18417500965' },
    ]

async function main(): Promise<void> {
  for (const t of TARGETS) {
    const images = await getDocImages(t.docId, t.itemId ? { itemId: t.itemId } : undefined)
    console.log(`DOC ${t.docId}${t.itemId ? ` (item ${t.itemId})` : ''}: ${images.length} images`)
    for (const img of images) {
      console.log(`  - url=${img.url.slice(0, 90)}${img.url.length > 90 ? '...' : ''}`)
      console.log(`    name=${img.name}  assetId=${img.assetId ?? '-'}  source=${img.source}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
