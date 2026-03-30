/**
 * Bulk-ingest files from a local directory into a Document Chat collection
 * (same pipeline as /api/document-chat/upload).
 *
 * Prerequisites: SUPABASE_URL, SUPABASE_SERVICE_KEY, VOYAGE_API_KEY in env
 * (e.g. via .env.local). Optional: ANTHROPIC_API_KEY for KG extraction during ingest.
 *
 * Usage:
 *   npx tsx src/scripts/ingest-loop-document-chat.ts --dir "C:/path/to/briefings" --slug loop-briefings
 *
 * Creates the collection if it does not exist (slug + display name).
 */

import { config as loadEnv } from 'dotenv'
// Next.js-style local secrets
loadEnv({ path: '.env.local' })
loadEnv()
import { readdir, readFile } from 'fs/promises'
import { join, extname, basename } from 'path'
import { createClient } from '@supabase/supabase-js'
import { ingestDocumentFile } from '../../lib/document-chat/ingest.js'
import { isValidCollectionSlug } from '../../lib/document-chat/slug.js'
import { isDocumentChatEmbeddingConfigured } from '../../lib/document-chat/embed.js'

const SUPPORTED_EXT = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'json',
  'pdf',
  'docx',
  'pptx',
  'ppt',
  'xlsx',
  'xls',
])

function getArg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag)
  if (i === -1 || i + 1 >= process.argv.length) return undefined
  return process.argv[i + 1]
}

function contentTypeForExt(ext: string): string | null {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    txt: 'text/plain',
    md: 'text/markdown',
    markdown: 'text/markdown',
    csv: 'text/csv',
    json: 'application/json',
  }
  return map[ext] ?? null
}

async function main() {
  const dir = getArg('--dir')
  const slug = getArg('--slug') ?? 'loop-briefings'
  const name = getArg('--name') ?? 'Loop context briefings'

  if (!dir) {
    console.error('Usage: npx tsx src/scripts/ingest-loop-document-chat.ts --dir <folder> [--slug loop-briefings] [--name "Display name"]')
    process.exit(1)
  }

  if (!isValidCollectionSlug(slug)) {
    console.error(`Invalid slug "${slug}": use lowercase letters, numbers, hyphens; start with alphanumeric; max 63 chars.`)
    process.exit(1)
  }

  if (!isDocumentChatEmbeddingConfigured()) {
    console.error('Missing SUPABASE_URL, SUPABASE_SERVICE_KEY, and/or VOYAGE_API_KEY.')
    process.exit(1)
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required.')
    process.exit(1)
  }

  const db = createClient(supabaseUrl, supabaseKey)

  let collectionId: string
  const { data: existing, error: findErr } = await db
    .from('document_chat_collections')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()

  if (findErr) {
    console.error('Lookup collection:', findErr.message)
    process.exit(1)
  }

  if (existing?.id) {
    collectionId = existing.id
    console.log(`Using existing collection "${slug}" (${collectionId})`)
  } else {
    const { data: created, error: insErr } = await db
      .from('document_chat_collections')
      .insert({
        slug,
        name,
        description: 'Ingested via ingest-loop-document-chat.ts',
        created_by: null,
      })
      .select('id')
      .single()

    if (insErr || !created) {
      console.error('Create collection:', insErr?.message ?? 'unknown error')
      process.exit(1)
    }
    collectionId = created.id
    console.log(`Created collection "${slug}" (${collectionId})`)
  }

  const entries = await readdir(dir, { withFileTypes: true })
  const files = entries.filter((e) => e.isFile()).map((e) => e.name)

  let ok = 0
  let fail = 0

  for (const fname of files.sort()) {
    const ext = extname(fname).slice(1).toLowerCase()
    if (!SUPPORTED_EXT.has(ext)) {
      console.log(`Skip (unsupported): ${fname}`)
      continue
    }

    const full = join(dir, fname)
    const buffer = await readFile(full)
    const ct = contentTypeForExt(ext)

    try {
      const r = await ingestDocumentFile({
        collectionId,
        filename: basename(fname),
        buffer,
        contentType: ct,
        userId: null,
      })
      console.log(`OK ${fname} → document ${r.documentId}, ${r.chunkCount} chunks`)
      ok++
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.error(`FAIL ${fname}: ${msg}`)
      fail++
    }
  }

  console.log(`Done. Ingested: ${ok}, failed: ${fail}. Collection slug: ${slug}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
