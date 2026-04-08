import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * DELETE /api/feedback/rounds/:id
 * Deletes a round and all its experiments/entries (cascade).
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Round id is required' }, { status: 400 })
  }

  const { error } = await db.from('feedback_rounds').delete().eq('id', id)
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, deleted: id })
}
