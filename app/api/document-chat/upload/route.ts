import { NextResponse } from 'next/server'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { ingestDocumentFile } from '@/lib/document-chat/ingest.js'
import { getSupabase } from '@/lib/supabase'
import { isDocumentChatEmbeddingConfigured } from '@/lib/document-chat/embed.js'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/document-chat/upload
 * multipart/form-data: collection_id (uuid), file or files[]
 */
export async function POST(request: Request) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  if (!isDocumentChatEmbeddingConfigured()) {
    return NextResponse.json(
      { error: 'Document chat requires SUPABASE_URL, SUPABASE_SERVICE_KEY, and VOYAGE_API_KEY' },
      { status: 503 },
    )
  }

  const form = await request.formData()
  const collectionId = form.get('collection_id')
  if (typeof collectionId !== 'string' || !collectionId) {
    return NextResponse.json({ error: 'collection_id is required' }, { status: 400 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data: col, error: colErr } = await supabase
    .from('document_chat_collections')
    .select('id')
    .eq('id', collectionId)
    .maybeSingle()
  if (colErr || !col) {
    return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
  }

  const files: File[] = []
  const single = form.get('file')
  if (single instanceof File && single.size > 0) files.push(single)
  const multi = form.getAll('files')
  for (const f of multi) {
    if (f instanceof File && f.size > 0) files.push(f)
  }

  if (files.length === 0) {
    return NextResponse.json({ error: 'No files provided (use file or files[])' }, { status: 400 })
  }

  const results: Array<{ filename: string; documentId?: string; chunkCount?: number; error?: string }> = []

  for (const file of files) {
    const buf = Buffer.from(await file.arrayBuffer())
    try {
      const r = await ingestDocumentFile({
        collectionId,
        filename: file.name,
        buffer: buf,
        contentType: file.type || null,
        userId: auth.user.id,
      })
      results.push({ filename: file.name, documentId: r.documentId, chunkCount: r.chunkCount })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      results.push({ filename: file.name, error: msg })
    }
  }

  return NextResponse.json({ results })
}
