import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { deleteDocumentById } from '@/lib/document-chat/ingest'

export const dynamic = 'force-dynamic'

/**
 * GET /api/document-chat/documents/[documentId] — detail + KG counts for UI.
 * DELETE — remove document, chunks, relations (via cascade), storage, prune orphan entities.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const auth = await requirePrivilegedUser(_request)
  if (auth.error) return auth.error

  const { documentId } = await context.params
  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data: doc, error: dErr } = await supabase
    .from('document_chat_documents')
    .select(
      'id, collection_id, filename, status, chunk_count, error_message, created_at, updated_at, parsed_markdown',
    )
    .eq('id', documentId)
    .maybeSingle()

  if (dErr || !doc) {
    return NextResponse.json({ error: 'Document not found' }, { status: 404 })
  }

  const { data: chunks } = await supabase.from('document_chat_chunks').select('id').eq('document_id', documentId)

  const chunkIds = (chunks ?? []).map((c) => c.id)
  let relationCount = 0
  const entityIds = new Set<string>()

  if (chunkIds.length > 0) {
    const { data: rels } = await supabase
      .from('document_chat_relations')
      .select('id, source_entity_id, target_entity_id')
      .in('evidence_chunk_id', chunkIds)

    relationCount = rels?.length ?? 0
    for (const r of rels ?? []) {
      entityIds.add(r.source_entity_id)
      entityIds.add(r.target_entity_id)
    }
  }

  const previewLen = 500
  const md = doc.parsed_markdown as string | null
  const parsed_preview =
    md && md.length > previewLen ? `${md.slice(0, previewLen)}…` : md ?? null

  return NextResponse.json({
    document: {
      id: doc.id,
      collection_id: doc.collection_id,
      filename: doc.filename,
      status: doc.status,
      chunk_count: doc.chunk_count,
      error_message: doc.error_message,
      created_at: doc.created_at,
      updated_at: doc.updated_at,
      parsed_markdown_preview: parsed_preview,
      relation_count: relationCount,
      entity_count: entityIds.size,
    },
  })
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  const { documentId } = await context.params
  try {
    await deleteDocumentById(documentId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
