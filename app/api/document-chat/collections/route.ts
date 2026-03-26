import { NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { isValidCollectionSlug } from '@/lib/document-chat/slug'

export const dynamic = 'force-dynamic'

/**
 * GET /api/document-chat/collections — list corpora.
 * POST /api/document-chat/collections — create corpus (slug + name).
 */
export async function GET(request: Request) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('document_chat_collections')
    .select('id, slug, name, description, created_at')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ collections: data ?? [] })
}

const postSchema = z.object({
  slug: z.string().min(1).max(63),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
})

export async function POST(request: Request) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  let body: z.infer<typeof postSchema>
  try {
    body = postSchema.parse(await request.json())
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  if (!isValidCollectionSlug(body.slug)) {
    return NextResponse.json(
      {
        error:
          'Invalid slug: use lowercase letters, numbers, hyphens; start with alphanumeric; max 63 chars.',
      },
      { status: 400 },
    )
  }

  const supabase = getSupabase()
  if (!supabase) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data, error } = await supabase
    .from('document_chat_collections')
    .insert({
      slug: body.slug,
      name: body.name,
      description: body.description ?? null,
      created_by: auth.user.id,
    })
    .select('id, slug, name, description, created_at')
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'Collection slug already exists' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ collection: data })
}
