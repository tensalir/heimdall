import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requirePrivilegedUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/document-chat/documents?collection_id=uuid | collection_slug=slug
 */
export async function GET(request: Request) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  const { searchParams } = new URL(request.url)
  const collectionId = searchParams.get('collection_id')
  const collectionSlug = searchParams.get('collection_slug')

  if (!collectionId && !collectionSlug) {
    return NextResponse.json(
      { error: 'collection_id or collection_slug query parameter required' },
      { status: 400 },
    )
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  let cid = collectionId
  if (!cid && collectionSlug) {
    const { data: col, error: colErr } = await supabase
      .from('document_chat_collections')
      .select('id')
      .eq('slug', collectionSlug)
      .maybeSingle()
    if (colErr || !col) {
      return NextResponse.json({ error: 'Collection not found' }, { status: 404 })
    }
    cid = col.id
  }

  const { data, error } = await supabase
    .from('document_chat_documents')
    .select('id, filename, status, chunk_count, error_message, created_at, updated_at')
    .eq('collection_id', cid!)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ documents: data ?? [] })
}
