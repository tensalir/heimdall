/**
 * Ingest prior briefings into evidence_chunks for vector retrieval.
 *
 * Reads from briefing_assignments (working_doc_sections) and optionally from
 * Monday docs via docReader. Chunks by section and generates Voyage embeddings
 * matching the existing evidence stack (1024-d).
 *
 * Usage: npx tsx src/scripts/ingest-prior-briefings.ts [--sprint-id <id>]
 */

import { createHash } from 'crypto'

const VOYAGE_EMBED_API = 'https://api.voyageai.com/v1/embeddings'
const EMBED_DIM = 1024
const DATASOURCE_ID = 'prior_briefings'
const SECTION_KEYS = ['idea', 'why', 'audience', 'product', 'visual', 'copyInfo', 'test', 'variants'] as const

async function getEmbedding(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  const res = await fetch(VOYAGE_EMBED_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ input: text, model: 'voyage-3.5', input_type: 'document' }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
  const emb = data.data?.[0]?.embedding
  if (!emb || emb.length !== EMBED_DIM) return null
  return emb
}

function contentHash(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 40)
}

async function main() {
  const { createClient } = await import('@supabase/supabase-js')

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY required')
    process.exit(1)
  }
  if (!process.env.VOYAGE_API_KEY) {
    console.error('VOYAGE_API_KEY required for embedding generation')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, supabaseKey)

  const sprintIdArg = process.argv.includes('--sprint-id')
    ? process.argv[process.argv.indexOf('--sprint-id') + 1]
    : null

  const datasetKey = `prior-briefings-${new Date().toISOString().slice(0, 16).replace(/:/g, '')}`
  const { data: dataset } = await db
    .from('evidence_datasets')
    .insert({
      dataset_key: datasetKey,
      source_filename: 'briefing_assignments',
      extracted_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (!dataset) {
    console.error('Failed to create evidence_datasets row')
    process.exit(1)
  }
  const datasetId = dataset.id
  console.log(`Dataset: ${datasetId} (${datasetKey})`)

  let query = db
    .from('briefing_assignments')
    .select('id, brief_name, product_or_use_case, working_doc_sections, batch_key, status, updated_at, sprint_id, monday_item_id')
    .not('working_doc_sections', 'eq', '{}')
    .order('updated_at', { ascending: false })

  if (sprintIdArg) {
    query = query.eq('sprint_id', sprintIdArg)
  }

  const { data: assignments, error } = await query
  if (error) {
    console.error('Failed to fetch assignments:', error.message)
    process.exit(1)
  }
  if (!assignments?.length) {
    console.log('No assignments with working doc sections found.')
    process.exit(0)
  }

  console.log(`Processing ${assignments.length} assignments...`)
  let chunksInserted = 0
  let chunksSkipped = 0

  for (const row of assignments) {
    const sections = (row.working_doc_sections ?? {}) as Record<string, string>
    const summaryParts: string[] = []

    for (const key of SECTION_KEYS) {
      const value = sections[key]?.trim()
      if (!value) continue
      summaryParts.push(`${key}: ${value}`)

      const content = `[${key}] ${value}`
      const hash = contentHash(`${row.id}-${key}-${content}`)

      const embedding = await getEmbedding(content)
      if (!embedding) {
        console.warn(`  Skip ${row.brief_name}/${key}: embedding failed`)
        continue
      }

      const { error: insertErr } = await db.from('evidence_chunks').upsert(
        {
          dataset_id: datasetId,
          datasource_id: DATASOURCE_ID,
          product_or_use_case: row.product_or_use_case,
          content,
          content_hash: hash,
          embedding,
          source_row_id: row.id,
          recency: row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : null,
          context_json: {
            section: key,
            brief_name: row.brief_name,
            product_or_use_case: row.product_or_use_case,
            batch_key: row.batch_key,
            status: row.status,
            sprint_id: row.sprint_id,
            monday_item_id: row.monday_item_id,
            assignment_id: row.id,
            source_origin: 'working_doc',
          },
        },
        { onConflict: 'dataset_id,content_hash' },
      )

      if (insertErr) {
        console.warn(`  Upsert failed for ${row.brief_name}/${key}: ${insertErr.message}`)
        chunksSkipped++
      } else {
        chunksInserted++
      }
    }

    if (summaryParts.length > 1) {
      const summaryContent = `[summary] Briefing "${row.brief_name}" (${row.product_or_use_case}): ${summaryParts.join('. ')}`
      const summaryHash = contentHash(`${row.id}-summary-${summaryContent}`)
      const embedding = await getEmbedding(summaryContent)
      if (embedding) {
        const { error: sumErr } = await db.from('evidence_chunks').upsert(
          {
            dataset_id: datasetId,
            datasource_id: DATASOURCE_ID,
            product_or_use_case: row.product_or_use_case,
            content: summaryContent,
            content_hash: summaryHash,
            embedding,
            source_row_id: row.id,
            recency: row.updated_at ? new Date(row.updated_at).toISOString().slice(0, 10) : null,
            context_json: {
              section: 'summary',
              brief_name: row.brief_name,
              product_or_use_case: row.product_or_use_case,
              batch_key: row.batch_key,
              status: row.status,
              sprint_id: row.sprint_id,
              monday_item_id: row.monday_item_id,
              assignment_id: row.id,
              source_origin: 'working_doc',
            },
          },
          { onConflict: 'dataset_id,content_hash' },
        )
        if (!sumErr) chunksInserted++
        else chunksSkipped++
      }
    }
  }

  console.log(`Done. Inserted: ${chunksInserted}, Skipped: ${chunksSkipped}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
