/**
 * Find items that are currently eligible for plugin sync (Brief ready / approved
 * status, Studio or Content Creation partner) and report on their doc image
 * blocks and reference-link counts.
 *
 * This is the actual population the user is syncing, so it's the definitive
 * ground-truth for whether images are being extracted.
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const MONDAY_API_URL = 'https://api.monday.com/v2'
const TOKEN = process.env.MONDAY_API_TOKEN
const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'

if (!TOKEN) {
  console.error('MONDAY_API_TOKEN missing')
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

interface Row {
  id: string
  name: string
  created_at?: string
  column_values: Array<{ id: string; text: string | null; value: string | null; type: string; column: { title: string } }>
}

async function pageBoardItems(cursor: string | null): Promise<{ cursor: string | null; items: Row[] }> {
  if (cursor) {
    const data = await gql<{ next_items_page?: { cursor: string | null; items: Row[] } }>(
      `query ($cursor: String!) {
        next_items_page(cursor: $cursor, limit: 100) {
          cursor
          items { id name created_at column_values { id text value type column { title } } }
        }
      }`,
      { cursor },
    )
    return { cursor: data?.next_items_page?.cursor ?? null, items: data?.next_items_page?.items ?? [] }
  }
  const data = await gql<{ boards?: Array<{ items_page?: { cursor: string | null; items: Row[] } }> }>(
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 100) {
          cursor
          items { id name created_at column_values { id text value type column { title } } }
        }
      }
    }`,
    { boardId: BOARD_ID },
  )
  const page = data?.boards?.[0]?.items_page
  return { cursor: page?.cursor ?? null, items: page?.items ?? [] }
}

function getCol(row: Row, ...titles: string[]): string | null {
  const wanted = titles.map((t) => t.toLowerCase())
  for (const cv of row.column_values) {
    const title = (cv.column?.title ?? '').toLowerCase().replace(/\s+/g, '_')
    if (wanted.some((w) => title === w.replace(/\s+/g, '_'))) {
      if (cv.text && cv.text.trim()) return cv.text.trim()
    }
  }
  return null
}

function extractDocId(raw: string | null): string | null {
  if (!raw) return null
  const s = raw.trim()
  if (/^\d+$/.test(s)) return s
  try {
    const p = JSON.parse(s) as Record<string, unknown>
    if (Array.isArray((p as { files: unknown[] }).files) && (p as { files: unknown[] }).files.length > 0) {
      const f = (p as { files: Array<Record<string, unknown>> }).files[0]
      if (typeof f.objectId !== 'undefined') return String(f.objectId)
      if (typeof f.linkToFile === 'string') {
        const m = /docs\/(\d+)/i.exec(f.linkToFile)
        if (m) return m[1]
      }
    }
    if (typeof p.docId !== 'undefined') return String(p.docId)
  } catch {
    // ignore
  }
  return null
}

async function countBlocks(docId: string): Promise<{ imageBlocks: number; total: number; typeCounts: Record<string, number> }> {
  const objectId = Number(docId)
  if (!Number.isFinite(objectId)) return { imageBlocks: 0, total: 0, typeCounts: {} }
  let imageBlocks = 0
  let total = 0
  const typeCounts: Record<string, number> = {}
  let page = 1
  while (true) {
    const data = await gql<{ docs?: Array<{ blocks?: Array<{ type?: string }> }> }>(
      `query ($ids: [ID!]!, $limit: Int!, $page: Int!) {
        docs(object_ids: $ids) { blocks(limit: $limit, page: $page) { id type } }
      }`,
      { ids: [objectId], limit: 100, page },
    )
    const blocks = data?.docs?.[0]?.blocks ?? []
    if (!blocks.length) break
    total += blocks.length
    for (const b of blocks) {
      const t = String(b.type ?? '').toLowerCase() || '(missing)'
      typeCounts[t] = (typeCounts[t] ?? 0) + 1
      if (t === 'image' || t === 'file') imageBlocks++
    }
    if (blocks.length < 100) break
    page += 1
  }
  return { imageBlocks, total, typeCounts }
}

async function main(): Promise<void> {
  console.log(`Board ${BOARD_ID}: paging through items...`)
  const eligible: Row[] = []
  let cursor: string | null = null
  let scanned = 0
  const MAX_PAGES = 10
  for (let i = 0; i < MAX_PAGES; i++) {
    const { cursor: next, items } = await pageBoardItems(cursor)
    scanned += items.length
    for (const item of items) {
      const status = (getCol(item, 'status', 'brief_status') ?? '').toLowerCase()
      const partner = (getCol(item, 'creative partner', 'creation team', 'creative team', 'assigned team', 'team', 'assignee team') ?? '').toLowerCase()
      if (status === 'brief ready / approved' && (partner === 'studio' || partner === 'content creation')) {
        eligible.push(item)
      }
    }
    if (!next) break
    cursor = next
  }
  console.log(`Scanned ${scanned} items, eligible: ${eligible.length}`)

  for (const item of eligible.slice(0, 20)) {
    const briefRaw = getCol(item, 'brief', 'briefing', 'doc')
    let briefRawFallback: string | null = briefRaw
    if (!briefRawFallback) {
      // Try to read raw column value directly to find doc columns
      for (const cv of item.column_values) {
        if (cv.type === 'doc' && cv.value) { briefRawFallback = cv.value; break }
        if (cv.column?.title?.toLowerCase().includes('brief') && cv.value) { briefRawFallback = cv.value; break }
      }
    }
    const docId = extractDocId(briefRawFallback)
    console.log(`\n${item.id}  ${item.name}  createdAt=${item.created_at ?? ''}`)
    console.log(`  batch: ${getCol(item, 'batch', 'batch_name') ?? '(none)'}`)
    console.log(`  briefRaw: ${(briefRawFallback ?? '').slice(0, 100)}`)
    console.log(`  docId: ${docId ?? '(none)'}`)
    if (!docId) continue
    try {
      const { imageBlocks, total, typeCounts } = await countBlocks(docId)
      console.log(`  blocks: total=${total}, image/file=${imageBlocks}`)
      console.log(`  types: ${Object.entries(typeCounts).map(([t, n]) => `${t}=${n}`).join(', ')}`)
    } catch (e) {
      console.log(`  ERROR reading blocks: ${e instanceof Error ? e.message : e}`)
    }
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
