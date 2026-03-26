import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requirePrivilegedUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/document-chat/stats?collection_id=uuid
 */
export async function GET(request: Request) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const collectionId = searchParams.get('collection_id')
  if (!collectionId) {
    return NextResponse.json({ error: 'collection_id required' }, { status: 400 })
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const [{ count: documentCount }, { count: chunkCount }, { count: entityCount }, { count: relationCount }] =
    await Promise.all([
      supabase
        .from('document_chat_documents')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collectionId),
      supabase
        .from('document_chat_chunks')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collectionId),
      supabase
        .from('document_chat_entities')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collectionId),
      supabase
        .from('document_chat_relations')
        .select('*', { count: 'exact', head: true })
        .eq('collection_id', collectionId),
    ])

  return NextResponse.json({
    collection_id: collectionId,
    document_count: documentCount ?? 0,
    chunk_count: chunkCount ?? 0,
    entity_count: entityCount ?? 0,
    relation_count: relationCount ?? 0,
  })
}
