/**
 * Backfill historical Monday briefings into evidence_chunks for vector retrieval.
 *
 * Reads items from one or more Monday boards, extracts doc content via docReader,
 * chunks by section, embeds with Voyage, and upserts into evidence_chunks.
 *
 * Uses a stable dataset key per board so repeated runs dedupe cleanly.
 *
 * Usage:
 *   npx tsx src/scripts/ingest-monday-briefings.ts --board-id 18404406006
 *   npx tsx src/scripts/ingest-monday-briefings.ts --board-id 18404406006 --board-id 9147622374
 *   npx tsx src/scripts/ingest-monday-briefings.ts --board-id 18404406006 --limit 50
 *
 * Env: SUPABASE_URL, SUPABASE_SERVICE_KEY, VOYAGE_API_KEY, MONDAY_API_TOKEN
 */

import { config as loadEnv } from 'dotenv'
loadEnv({ path: '.env.local' })
loadEnv()

import { createHash } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const VOYAGE_EMBED_API = 'https://api.voyageai.com/v1/embeddings'
const EMBED_DIM = 1024
const DATASOURCE_ID = 'monday_briefings'
const EMBED_BATCH_SIZE = 8

function getArg(flag: string): string[] {
  const values: string[] = []
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === flag && i + 1 < process.argv.length) {
      values.push(process.argv[i + 1])
    }
  }
  return values
}

function getArgSingle(flag: string): string | undefined {
  const vals = getArg(flag)
  return vals[0]
}

async function batchEmbed(texts: string[]): Promise<(number[] | null)[]> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return texts.map(() => null)
  const results: (number[] | null)[] = []
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE)
    const res = await fetch(VOYAGE_EMBED_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({ input: batch, model: 'voyage-3.5', input_type: 'document' }),
    })
    if (!res.ok) {
      results.push(...batch.map(() => null))
      continue
    }
    const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
    for (const row of data.data ?? []) {
      results.push(row.embedding?.length === EMBED_DIM ? row.embedding : null)
    }
    if ((data.data?.length ?? 0) < batch.length) {
      for (let j = data.data?.length ?? 0; j < batch.length; j++) results.push(null)
    }
  }
  return results
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 40)
}

interface ChunkToInsert {
  content: string
  hash: string
  productOrUseCase: string | null
  section: string
  contextJson: Record<string, unknown>
  recency: string | null
  sourceRowId: string
}

async function main() {
  const boardIds = getArg('--board-id')
  const limitArg = getArgSingle('--limit')
  const limit = limitArg ? parseInt(limitArg, 10) : undefined

  if (boardIds.length === 0) {
    console.error('Usage: npx tsx src/scripts/ingest-monday-briefings.ts --board-id <id> [--board-id <id2>] [--limit N]')
    process.exit(1)
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required')
    process.exit(1)
  }
  if (!process.env.VOYAGE_API_KEY) {
    console.error('VOYAGE_API_KEY required')
    process.exit(1)
  }
  if (!process.env.MONDAY_API_TOKEN) {
    console.error('MONDAY_API_TOKEN required')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, supabaseKey)

  const { readMondayBoardItems } = await import('../../src/services/mondayBoardReader.js')
  const { getDocContent } = await import('../../src/integrations/monday/docReader.js')

  let totalInserted = 0
  let totalSkipped = 0

  for (const boardId of boardIds) {
    console.log(`\n--- Board ${boardId} ---`)

    const datasetKey = `monday-briefings-board-${boardId}`
    const { data: existingDs } = await db
      .from('evidence_datasets')
      .select('id')
      .eq('dataset_key', datasetKey)
      .maybeSingle()

    let datasetId: string
    if (existingDs?.id) {
      datasetId = existingDs.id
      console.log(`Reusing dataset ${datasetId} (${datasetKey})`)
    } else {
      const { data: newDs } = await db
        .from('evidence_datasets')
        .insert({
          dataset_key: datasetKey,
          source_filename: `monday_board_${boardId}`,
          extracted_at: new Date().toISOString(),
        })
        .select('id')
        .single()
      if (!newDs) {
        console.error(`Failed to create dataset for board ${boardId}`)
        continue
      }
      datasetId = newDs.id
      console.log(`Created dataset ${datasetId} (${datasetKey})`)
    }

    let items = await readMondayBoardItems(boardId)
    console.log(`Fetched ${items.length} items from Monday`)

    if (limit && items.length > limit) {
      items = items.slice(0, limit)
      console.log(`Limited to ${limit} items`)
    }

    const chunks: ChunkToInsert[] = []

    for (const item of items) {
      const col: Record<string, string> = {}
      for (const cv of item.column_values) {
        const title = (cv.title ?? cv.id).toLowerCase().replace(/\s+/g, '_')
        const text = (cv.text ?? '').trim()
        if (title && text) col[title] = text
      }

      const product = col.product ?? col.product_category ?? col.use_case ?? null
      const batch = col.batch ?? col.batch_name ?? null
      const status = col.status ?? null

      let docText: string | null = null
      for (const cv of item.column_values) {
        if (cv.type !== 'doc' && !cv.id?.includes('doc')) continue
        const val = cv.value ?? cv.text ?? ''
        const docIdMatch = val.match(/\d{5,}/)
        if (docIdMatch) {
          try {
            docText = await getDocContent(docIdMatch[0], { itemId: item.id })
          } catch { /* doc read failed */ }
          if (docText) break
        }
      }

      const sections = parseBriefingSections(docText ?? '')

      if (Object.keys(sections).length === 0 && !docText) continue

      const baseContext = {
        monday_board_id: boardId,
        monday_item_id: item.id,
        monday_item_name: item.name,
        product_or_use_case: product,
        batch,
        status,
        source_origin: 'monday_doc',
      }

      for (const [key, value] of Object.entries(sections)) {
        if (!value || value.length < 20) continue
        chunks.push({
          content: `[${key}] ${value}`,
          hash: contentHash(`monday-${boardId}-${item.id}-${key}-${value}`),
          productOrUseCase: product,
          section: key,
          contextJson: { ...baseContext, section: key },
          recency: item.column_values.find(cv => cv.id?.includes('date'))?.text?.slice(0, 10) ?? null,
          sourceRowId: `monday:${boardId}:${item.id}`,
        })
      }

      if (Object.keys(sections).length > 1) {
        const summaryText = Object.entries(sections)
          .filter(([, v]) => v.length > 10)
          .map(([k, v]) => `${k}: ${v.slice(0, 200)}`)
          .join('. ')
        if (summaryText) {
          chunks.push({
            content: `[summary] Briefing "${item.name}"${product ? ` (${product})` : ''}: ${summaryText}`,
            hash: contentHash(`monday-${boardId}-${item.id}-summary-${summaryText}`),
            productOrUseCase: product,
            section: 'summary',
            contextJson: { ...baseContext, section: 'summary' },
            recency: null,
            sourceRowId: `monday:${boardId}:${item.id}`,
          })
        }
      }
    }

    console.log(`Prepared ${chunks.length} chunks for embedding`)

    const embeddings = await batchEmbed(chunks.map(c => c.content))

    let inserted = 0
    let skipped = 0
    for (let i = 0; i < chunks.length; i++) {
      const emb = embeddings[i]
      if (!emb) { skipped++; continue }
      const c = chunks[i]
      const { error: err } = await db.from('evidence_chunks').upsert(
        {
          dataset_id: datasetId,
          datasource_id: DATASOURCE_ID,
          product_or_use_case: c.productOrUseCase,
          content: c.content,
          content_hash: c.hash,
          embedding: emb,
          source_row_id: c.sourceRowId,
          recency: c.recency,
          context_json: c.contextJson,
        },
        { onConflict: 'dataset_id,content_hash' },
      )
      if (err) { skipped++ } else { inserted++ }
    }

    console.log(`Board ${boardId}: inserted ${inserted}, skipped ${skipped}`)
    totalInserted += inserted
    totalSkipped += skipped
  }

  console.log(`\nTotal: inserted ${totalInserted}, skipped ${totalSkipped}`)
}

function parseBriefingSections(docText: string): Record<string, string> {
  const sections: Record<string, string> = {}
  if (!docText.trim()) return sections

  const headingMap: Record<string, string> = {
    idea: 'idea', why: 'why', audience: 'audience', 'audience/region': 'audience',
    product: 'product', visual: 'visual', 'copy info': 'copyInfo', 'copy': 'copyInfo',
    test: 'test', testing: 'test', variants: 'variants', note: 'note', formats: 'formats',
  }

  const rx = /(?:^|\n)##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|\n*$)/gi
  let m: RegExpExecArray | null
  while ((m = rx.exec(docText)) !== null) {
    const heading = m[1].trim().toLowerCase()
    const content = m[2].trim()
    const key = headingMap[heading]
    if (key && content) sections[key] = content
  }

  if (Object.keys(sections).length === 0 && docText.length > 50) {
    sections['content'] = docText.slice(0, 2000)
  }

  return sections
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
