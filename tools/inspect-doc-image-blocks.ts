/**
 * Throwaway diagnostic: dump the RAW block types and content shapes returned
 * by Monday's docs API for briefings that should have embedded reference images.
 *
 * Loads MONDAY_API_TOKEN + MONDAY_BOARD_ID from .env.local, walks the most recent
 * items on the board, extracts each item's brief doc id, and prints every block's
 * type + a preview of its content. Also flags candidate image blocks whose type
 * is anything OTHER than the current strict filter ('image' | 'file') but whose
 * content still smells like an image (has src/url/publicUrl/assetId or a known
 * image key like data.image / data.file).
 *
 * Run: node --env-file=.env.local node_modules/.bin/tsx tools/inspect-doc-image-blocks.ts
 * or:  npx tsx tools/inspect-doc-image-blocks.ts   (dotenv is imported below)
 */

import 'dotenv/config'
import * as dotenv from 'dotenv'
import * as path from 'node:path'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const MONDAY_API_URL = 'https://api.monday.com/v2'
const TOKEN = process.env.MONDAY_API_TOKEN
const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'

if (!TOKEN) {
  console.error('MONDAY_API_TOKEN missing (checked .env.local)')
  process.exit(1)
}

async function gql<T = unknown>(query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN as string,
      'API-Version': '2025-04',
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday ${res.status} ${res.statusText}`)
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) throw new Error(json.errors.map((e) => e.message).join('; '))
  return (json.data as T) ?? ({} as T)
}

interface Item {
  id: string
  name: string
  created_at?: string
  column_values: Array<{ id: string; text: string | null; value: string | null; type: string; column: { title: string } }>
}

function extractDocId(raw: string | null | undefined): string | null {
  if (!raw) return null
  const s = String(raw).trim()
  if (/^\d+$/.test(s)) return s
  try {
    const parsed = JSON.parse(s) as Record<string, unknown>
    if (Array.isArray((parsed as Record<string, unknown>).files) && ((parsed as { files: unknown[] }).files).length > 0) {
      const first = (parsed as { files: Array<Record<string, unknown>> }).files[0]
      if (first && typeof first.objectId !== 'undefined') return String(first.objectId)
      if (first && typeof first.linkToFile === 'string') {
        const match = /docs\/(\d+)/i.exec(first.linkToFile)
        if (match) return match[1]
      }
    }
    if (typeof (parsed as Record<string, unknown>).docId !== 'undefined') return String((parsed as { docId: unknown }).docId)
    if (typeof (parsed as Record<string, unknown>).link === 'string') {
      const link = (parsed as { link: string }).link
      const match = /docs?\/(\d+)/i.exec(link) || /id=(\d+)/.exec(link)
      if (match) return match[1]
    }
  } catch {
    // not JSON
  }
  return s
}

/** True if the block content smells image-ish regardless of its declared type. */
function looksImagey(content: unknown, depth = 0): boolean {
  if (depth > 6 || content == null) return false
  let obj: Record<string, unknown> | null = null
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content) as unknown
      if (parsed && typeof parsed === 'object') obj = parsed as Record<string, unknown>
    } catch {
      // ignore
    }
  } else if (typeof content === 'object' && !Array.isArray(content)) {
    obj = content as Record<string, unknown>
  }
  if (!obj) return false
  const keys = Object.keys(obj).map((k) => k.toLowerCase())
  const imageyKeys = ['src', 'url', 'publicurl', 'public_url', 'rawurl', 'raw_url', 'assetid', 'asset_id', 'fileid', 'file_id', 'fileextension', 'file_extension']
  if (imageyKeys.some((k) => keys.includes(k))) return true
  for (const nestedKey of ['data', 'image', 'file', 'content']) {
    const nested = obj[nestedKey]
    if (nested && typeof nested === 'object' && looksImagey(nested, depth + 1)) return true
  }
  return false
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '...'
}

async function main(): Promise<void> {
  console.log(`Board ${BOARD_ID}, listing most recent 50 items...`)
  const boardData = await gql<{ boards?: Array<{ items_page?: { items?: Item[] } }> }>(
    `query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 50) {
          items {
            id
            name
            created_at
            column_values {
              id
              text
              value
              type
              column { title }
            }
          }
        }
      }
    }`,
    { boardId: BOARD_ID },
  )
  const items = boardData?.boards?.[0]?.items_page?.items ?? []
  console.log(`Fetched ${items.length} items`)

  const candidates: Array<{ item: Item; docId: string }> = []
  for (const item of items) {
    const briefCol = item.column_values.find((c) => {
      const title = (c.column?.title || '').toLowerCase()
      return title === 'brief' || title === 'briefing' || title === 'doc' || c.type === 'doc'
    })
    const raw = briefCol?.value ?? briefCol?.text ?? null
    const docId = extractDocId(raw)
    if (docId) candidates.push({ item, docId })
  }
  console.log(`Candidates with doc id: ${candidates.length}`)

  const MAX_DOCS = 8
  const targets = candidates.slice(0, MAX_DOCS)
  console.log(`Scanning up to ${targets.length} docs for image blocks...\n`)

  const shapeSamples = new Map<string, { count: number; sample: unknown }>()

  for (const { item, docId } of targets) {
    console.log(`===== ITEM ${item.id} "${item.name}"  DOC ${docId} =====`)

    const objectId = Number(docId)
    if (!Number.isFinite(objectId)) {
      console.log('  (docId not numeric, skipping)')
      continue
    }

    let allBlocks: Array<{ id: string; type?: string; content?: unknown }> = []
    let page = 1
    const limit = 100
    while (true) {
      let docsData: { docs?: Array<{ id: string; blocks?: Array<{ id: string; type?: string; content?: unknown }> }> } = {}
      try {
        docsData = await gql<{ docs?: Array<{ id: string; blocks?: Array<{ id: string; type?: string; content?: unknown }> }> }>(
          `query ($objectIds: [ID!]!, $limit: Int!, $page: Int!) {
            docs(object_ids: $objectIds) {
              id
              blocks(limit: $limit, page: $page) {
                id
                type
                content
              }
            }
          }`,
          { objectIds: [objectId], limit, page },
        )
      } catch (err) {
        console.log('  DOCS_QUERY_ERROR', err instanceof Error ? err.message : String(err))
        break
      }
      const blocks = docsData?.docs?.[0]?.blocks ?? []
      if (!blocks.length) break
      allBlocks.push(...blocks)
      if (blocks.length < limit) break
      page += 1
    }

    if (!allBlocks.length) {
      console.log('  (0 blocks)')
      continue
    }

    const typeCounts = new Map<string, number>()
    for (const b of allBlocks) {
      const t = String(b.type ?? '').toLowerCase() || '(missing)'
      typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
    }
    const typesStr = [...typeCounts.entries()].map(([t, n]) => `${t}=${n}`).join(', ')
    console.log(`  block types: ${typesStr}`)

    for (const b of allBlocks) {
      const t = String(b.type ?? '').toLowerCase()
      const strictMatch = t === 'image' || t === 'file'
      const imagey = looksImagey(b.content)
      if (!strictMatch && !imagey) continue

      const contentStr = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
      const preview = truncate(contentStr ?? '', 500)
      const tag = strictMatch ? 'STRICT_MATCH' : 'IMAGEY_BUT_WRONG_TYPE'
      console.log(`  [${tag}] blockId=${b.id} type=${t}`)
      console.log(`    content: ${preview}`)

      const key = `${tag}|${t}`
      if (!shapeSamples.has(key)) {
        shapeSamples.set(key, { count: 1, sample: b.content })
      } else {
        const existing = shapeSamples.get(key)!
        existing.count += 1
      }
    }
    console.log('')
  }

  console.log('\n===== SHAPE SUMMARY =====')
  for (const [key, { count, sample }] of shapeSamples.entries()) {
    console.log(`--- ${key}  (count=${count}) ---`)
    const s = typeof sample === 'string' ? sample : JSON.stringify(sample, null, 2)
    console.log(truncate(s ?? '', 1000))
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
