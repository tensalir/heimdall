import { createHash, randomUUID } from 'crypto'
import { getSupabase } from '../supabase.js'
import { DOCUMENT_CHAT_BUCKET, MAX_CHUNKS_PER_DOCUMENT, MAX_UPLOAD_BYTES } from './constants.js'
import { splitIntoChunks } from './chunk.js'
import { extractDocumentContent } from './extractText.js'
import { embedDocuments } from './embed.js'
import { sha256ContentHash } from './retrieval.js'
import { persistKgForDocumentChunks, pruneOrphanEntities } from './kg-extract.js'

const MAX_PARSED_MARKDOWN_STORE = 2_000_000

function fileSha256(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex')
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 200) || 'file'
}

export interface IngestFileParams {
  collectionId: string
  filename: string
  buffer: Buffer
  contentType: string | null
  userId: string | null
}

export interface IngestFileResult {
  documentId: string
  chunkCount: number
  skipped?: boolean
}

async function processDocumentCore(
  supabase: NonNullable<ReturnType<typeof getSupabase>>,
  docId: string,
  collectionId: string,
  filename: string,
  buffer: Buffer,
): Promise<{ chunkCount: number }> {
  let extract: Awaited<ReturnType<typeof extractDocumentContent>>
  try {
    extract = await extractDocumentContent(filename, buffer)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: msg,
        parsed_markdown: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
    throw e
  }

  const mdToStore =
    extract.useMarkdownChunking && extract.text.length > 0
      ? extract.text.slice(0, MAX_PARSED_MARKDOWN_STORE)
      : null

  await supabase
    .from('document_chat_documents')
    .update({
      parsed_markdown: mdToStore,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId)

  const chunks = splitIntoChunks(extract.text, { markdown: extract.useMarkdownChunking }).slice(
    0,
    MAX_CHUNKS_PER_DOCUMENT,
  )

  if (chunks.length === 0) {
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: 'No extractable text',
        chunk_count: 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
    return { chunkCount: 0 }
  }

  const embeddings = await embedDocuments(chunks)
  if (!embeddings || embeddings.length !== chunks.length) {
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: 'Embedding generation failed (check VOYAGE_API_KEY)',
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
    throw new Error('Embedding generation failed')
  }

  const rows = chunks.map((content, chunkIndex) => ({
    document_id: docId,
    collection_id: collectionId,
    chunk_index: chunkIndex,
    content,
    content_hash: sha256ContentHash(`${docId}:${chunkIndex}:${content}`),
    embedding: embeddings[chunkIndex]!,
    context_json: { filename },
  }))

  const { data: insertedRows, error: chunkErr } = await supabase
    .from('document_chat_chunks')
    .insert(rows)
    .select('id, chunk_index, content')

  if (chunkErr || !insertedRows?.length) {
    await supabase.from('document_chat_chunks').delete().eq('document_id', docId)
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: chunkErr?.message ?? 'Chunk insert failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
    throw new Error(chunkErr?.message ?? 'Chunk insert failed')
  }

  const ordered = [...insertedRows].sort((a, b) => a.chunk_index - b.chunk_index)
  try {
    await persistKgForDocumentChunks(supabase, collectionId, filename, ordered)
  } catch (kgErr) {
    console.warn('[ingest] KG extraction failed (document still marked ready):', kgErr)
  }

  await supabase
    .from('document_chat_documents')
    .update({
      status: 'ready',
      chunk_count: chunks.length,
      error_message: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', docId)

  return { chunkCount: chunks.length }
}

/**
 * Upload raw bytes to storage, extract text, chunk, embed, insert rows, optional KG.
 */
export async function ingestDocumentFile(params: IngestFileParams): Promise<IngestFileResult> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Database not configured')

  if (params.buffer.length > MAX_UPLOAD_BYTES) {
    throw new Error(`File exceeds limit of ${MAX_UPLOAD_BYTES} bytes`)
  }

  const contentHash = fileSha256(params.buffer)
  const safeName = sanitizeFilename(params.filename)
  const docId = randomUUID()
  const storagePath = `${params.collectionId}/${docId}/${safeName}`

  const { error: upErr } = await supabase.storage
    .from(DOCUMENT_CHAT_BUCKET)
    .upload(storagePath, params.buffer, {
      contentType: params.contentType ?? 'application/octet-stream',
      upsert: false,
    })
  if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`)

  const { data: docRow, error: insErr } = await supabase
    .from('document_chat_documents')
    .insert({
      id: docId,
      collection_id: params.collectionId,
      filename: params.filename,
      content_type: params.contentType,
      storage_path: storagePath,
      content_hash: contentHash,
      status: 'processing',
      created_by: params.userId,
    })
    .select('id')
    .single()

  if (insErr || !docRow) {
    await supabase.storage.from(DOCUMENT_CHAT_BUCKET).remove([storagePath])
    throw new Error(insErr?.message ?? 'Failed to create document row')
  }

  try {
    const { chunkCount } = await processDocumentCore(
      supabase,
      docId,
      params.collectionId,
      params.filename,
      params.buffer,
    )
    return { documentId: docId, chunkCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', docId)
    throw e
  }
}

/**
 * Delete chunks + storage object + document row; prune orphan entities in collection.
 */
export async function deleteDocumentById(documentId: string): Promise<void> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Database not configured')

  const { data: doc, error: dErr } = await supabase
    .from('document_chat_documents')
    .select('id, collection_id, storage_path')
    .eq('id', documentId)
    .maybeSingle()

  if (dErr || !doc) throw new Error('Document not found')

  if (doc.storage_path) {
    await supabase.storage.from(DOCUMENT_CHAT_BUCKET).remove([doc.storage_path])
  }

  const { error: delErr } = await supabase.from('document_chat_documents').delete().eq('id', documentId)
  if (delErr) throw new Error(delErr.message)

  await pruneOrphanEntities(supabase, doc.collection_id)
}

/**
 * Re-download from storage and re-run extract / chunk / embed / KG.
 */
export async function reprocessDocumentById(documentId: string): Promise<IngestFileResult> {
  const supabase = getSupabase()
  if (!supabase) throw new Error('Database not configured')

  const { data: doc, error } = await supabase
    .from('document_chat_documents')
    .select('id, collection_id, filename, storage_path, content_type')
    .eq('id', documentId)
    .maybeSingle()

  if (error || !doc?.storage_path) throw new Error('Document not found')

  const { data: blob, error: dlErr } = await supabase.storage
    .from(DOCUMENT_CHAT_BUCKET)
    .download(doc.storage_path)

  if (dlErr || !blob) throw new Error(dlErr?.message ?? 'Failed to download file')

  const buffer = Buffer.from(await blob.arrayBuffer())

  await supabase.from('document_chat_chunks').delete().eq('document_id', documentId)
  await pruneOrphanEntities(supabase, doc.collection_id)

  await supabase
    .from('document_chat_documents')
    .update({
      status: 'processing',
      error_message: null,
      chunk_count: null,
      parsed_markdown: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentId)

  try {
    const { chunkCount } = await processDocumentCore(
      supabase,
      doc.id,
      doc.collection_id,
      doc.filename,
      buffer,
    )
    return { documentId: doc.id, chunkCount }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await supabase
      .from('document_chat_documents')
      .update({
        status: 'failed',
        error_message: msg,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
    throw e
  }
}
