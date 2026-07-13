/**
 * For a given doc id, dump ALL block types+content verbatim so we can spot
 * embedded-image blocks that don't match getDocImages's strict filter.
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const MONDAY_API_URL = 'https://api.monday.com/v2'
const TOKEN = process.env.MONDAY_API_TOKEN

if (!TOKEN) {
  console.error('MONDAY_API_TOKEN missing')
  process.exit(1)
}

const DOC_IDS = process.argv.slice(2)
if (DOC_IDS.length === 0) {
  console.error('Usage: tsx tools/dump-doc-blocks.ts <docId> [<docId>...]')
  process.exit(1)
}

async function gql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN as string,
      'API-Version': '2025-04',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday ${res.status}`)
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  return json.data as T
}

async function main(): Promise<void> {
  for (const docId of DOC_IDS) {
    console.log(`\n===== DOC ${docId} =====`)
    const objectId = Number(docId)
    if (!Number.isFinite(objectId)) {
      console.log('  (docId not numeric)')
      continue
    }

    const allBlocks: Array<{ id: string; type?: string; content?: unknown; parent_block_id?: string | null }> = []
    let page = 1
    const limit = 100
    while (true) {
      const data = await gql<{
        docs?: Array<{ blocks?: Array<{ id: string; type?: string; content?: unknown; parent_block_id?: string | null }> }>
      }>(
        `query ($objectIds: [ID!]!, $limit: Int!, $page: Int!) {
          docs(object_ids: $objectIds) {
            blocks(limit: $limit, page: $page) {
              id
              type
              parent_block_id
              content
            }
          }
        }`,
        { objectIds: [objectId], limit, page },
      )
      const blocks = data?.docs?.[0]?.blocks ?? []
      if (!blocks.length) break
      allBlocks.push(...blocks)
      if (blocks.length < limit) break
      page += 1
    }

    console.log(`  block count: ${allBlocks.length}`)

    const typeCount = new Map<string, number>()
    for (const b of allBlocks) {
      const t = String(b.type ?? '').toLowerCase() || '(missing)'
      typeCount.set(t, (typeCount.get(t) ?? 0) + 1)
    }
    for (const [t, n] of typeCount.entries()) console.log(`    type=${t} count=${n}`)

    console.log('\n  full block dump:')
    for (const b of allBlocks) {
      const t = String(b.type ?? '').toLowerCase()
      const contentStr = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
      const preview = contentStr && contentStr.length > 220 ? contentStr.slice(0, 220) + '...' : contentStr
      console.log(`  [${t}] id=${b.id} parent=${b.parent_block_id ?? '-'}`)
      console.log(`    ${preview}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
