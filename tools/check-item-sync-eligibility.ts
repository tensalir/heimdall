/**
 * For a given itemId, check what the /api/plugin/briefings + /api/plugin/sync
 * pipeline would do with it — batch, status, partner, and whether it would
 * be queued or skipped.
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getMondayItem } from '../src/api/webhooks/monday.ts'
import { columnMap, getCol } from '../src/integrations/monday/client.ts'
import { parseBatchToCanonical } from '../src/domain/routing/batchToFile.ts'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'
const ITEM_IDS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['12082185986', '11720285551', '12052151005', '11662245821']

async function main(): Promise<void> {
  for (const itemId of ITEM_IDS) {
    console.log(`\n===== ${itemId} =====`)
    const item = await getMondayItem(BOARD_ID, itemId)
    if (!item) {
      console.log('  not found')
      continue
    }
    console.log(`  name: ${item.name}`)
    console.log(`  created_at: ${item.created_at ?? '-'}`)

    const col = columnMap(item)
    const status = getCol(col, 'status', 'brief_status')
    const partner = getCol(col, 'creative_partner', 'creatives', 'creation_team', 'creative_team', 'assigned_team', 'team', 'assignee_team')
    const batch = getCol(col, 'batch', 'batch_name')
    const parsed = batch ? parseBatchToCanonical(batch) : null

    console.log(`  status: ${status ?? '(none)'}`)
    console.log(`  creative_partner: ${partner ?? '(none)'}`)
    console.log(`  batch raw: ${batch ?? '(none)'}`)
    console.log(`  batch canonical: ${parsed?.canonicalKey ?? '(unparseable)'}`)
    console.log(`  expected file: ${parsed?.expectedFileName ?? '(unknown)'}`)
    console.log(`  eligible for plugin sync (status='brief ready / approved' && partner in [studio, content creation]):`)
    console.log(`    status ok: ${(status ?? '').toLowerCase().trim() === 'brief ready / approved'}`)
    console.log(`    partner ok: ${['studio', 'content creation'].includes((partner ?? '').toLowerCase().trim())}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
