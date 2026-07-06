/**
 * End-to-end test: fetch Monday item, map to briefing, queue job, inspect result.
 * Run: npx tsx src/scripts/test-e2e.ts
 */

import 'dotenv/config'
import { mondayGraphql, columnMap, getCol } from '../integrations/monday/client.js'
import type { MondayItem } from '../integrations/monday/client.js'
import { mondayItemToBriefing } from '../domain/briefing/mondayToBriefing.js'
import { createOrQueueFigmaPage, buildIdempotencyKey } from '../orchestration/createOrQueueFigmaPage.js'
import { resolveFigmaTarget } from '../orchestration/resolveFigmaTarget.js'
import { getTemplateNodeTree } from '../integrations/figma/templateCache.js'
import { computeNodeMapping } from '../agents/mappingAgent.js'
import { getDocContent, getDocIdFromColumnValue } from '../integrations/monday/docReader.js'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'
const ITEM_ID = '10867939252'

async function fetchItem(): Promise<MondayItem | null> {
  const data = await mondayGraphql<{
    items?: Array<{
      id: string
      name: string
      column_values: Array<{
        id: string
        text: string | null
        value: string | null
        type: string
        column: { title: string }
      }>
    }>
  }>(
    `query ($ids: [ID!]!) {
      items(ids: $ids) {
        id
        name
        column_values {
          id
          text
          value
          type
          column { title }
        }
      }
    }`,
    { ids: [ITEM_ID] }
  )
  // Remap to MondayItem shape (title on column_values)
  const raw = data?.items?.[0]
  if (!raw) return null
  return {
    id: raw.id,
    name: raw.name,
    column_values: raw.column_values.map((cv) => ({
      id: cv.id,
      title: cv.column.title,
      text: cv.text,
      value: cv.value,
      type: cv.type,
    })),
  } as MondayItem
}

async function main() {
  console.log(`\n=== Fetching Monday item ${ITEM_ID} from board ${BOARD_ID} ===\n`)
  const item = await fetchItem()
  if (!item) {
    console.error('Item not found!')
    process.exit(1)
  }

  console.log(`Item name: ${item.name}`)
  console.log(`Columns (${item.column_values?.length ?? 0}):`)
  const col = columnMap(item)
  for (const [k, v] of Object.entries(col)) {
    if (v != null && String(v).trim()) {
      console.log(`  ${k}: ${String(v).substring(0, 120)}`)
    }
  }

  console.log(`\n=== Mapping to BriefingDTO ===\n`)
  const briefing = mondayItemToBriefing(item)
  if (!briefing) {
    console.error('Could not map to briefing (batch missing?)')
    // Show raw batch value
    console.log('Raw batch:', getCol(col, 'batch', 'batch_name'))
    process.exit(1)
  }

  console.log(JSON.stringify(briefing, null, 2))

  // --- Claude mapping agent ---
  let nodeMapping: Array<{ nodeName: string; value: string }> | undefined
  let frameRenames: Array<{ oldName: string; newName: string }> | undefined
  const target = resolveFigmaTarget(briefing.batchRaw ?? briefing.batchCanonical)
  if (target?.figmaFileKey) {
    console.log(`\n=== Fetching template node tree (file: ${target.figmaFileKey}) ===\n`)
    const tree = await getTemplateNodeTree(target.figmaFileKey)
    console.log(`Template tree nodes: ${JSON.stringify(tree).length} chars`)

    // Try doc reader
    let mondayDocContent: string | null = null
    const briefRaw = getCol(col, 'brief', 'briefing', 'doc')
    const docId = getDocIdFromColumnValue(briefRaw ?? null)
    if (docId) {
      console.log(`\n=== Fetching Monday Doc (id: ${docId}) ===\n`)
      mondayDocContent = await getDocContent(docId, { itemId: ITEM_ID })
      console.log(mondayDocContent ? `Doc content: ${mondayDocContent.substring(0, 200)}...` : 'Doc not accessible')
    }

    console.log(`\n=== Running Claude mapping agent ===\n`)
    const mapping = await computeNodeMapping(item, tree, { mondayDocContent })
    nodeMapping = mapping.textMappings
    frameRenames = mapping.frameRenames
    console.log(`textMappings (${nodeMapping.length}):`)
    for (const m of nodeMapping) console.log(`  "${m.nodeName}" → "${m.value.substring(0, 80)}"`)
    console.log(`frameRenames (${frameRenames.length}):`)
    for (const r of frameRenames) console.log(`  "${r.oldName}" → "${r.newName}"`)
  } else {
    console.log('\nNo Figma file key resolved; skipping mapping agent.')
  }

  console.log(`\n=== Queueing Figma sync job ===\n`)
  const idempotencyKey = buildIdempotencyKey(ITEM_ID, 'test-run-' + Date.now())
  const result = await createOrQueueFigmaPage(briefing, {
    mondayBoardId: BOARD_ID,
    idempotencyKey,
    nodeMapping,
    frameRenames,
  })
  console.log(`Outcome: ${result.outcome}`)
  console.log(`Message: ${result.message}`)
  console.log(`Expected file: ${result.expectedFileName}`)
  console.log(`File key: ${result.figmaFileKey ?? '(not mapped)'}`)
  if (result.job) {
    console.log(`Job ID: ${result.job.id}`)
    console.log(`Page name: ${result.job.experimentPageName}`)
    console.log(`Section: ${(result.job.briefingPayload as { sectionName?: string }).sectionName ?? '(none)'}`)
    console.log(`Has nodeMapping: ${!!result.job.nodeMapping?.length}`)
    console.log(`Has frameRenames: ${!!result.job.frameRenames?.length}`)
  }

  console.log('\n=== Done ===')
  console.log('Next: open the Figma file and run the Heimdall Sync plugin to materialize the page.')
}

main().catch((e) => {
  console.error('Error:', e)
  process.exit(1)
})
