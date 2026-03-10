import { NextResponse } from 'next/server'
import { createSupabaseRouteClient } from '@/lib/supabase-auth'

/**
 * GET /api/pinned-projects
 *
 * Returns pinned project IDs for the current authenticated user.
 * Uses the session-bound client so RLS enforces per-user access.
 */
export async function GET(request: Request) {
  const { supabase } = createSupabaseRouteClient(request)
  if (!supabase) return NextResponse.json({ pinnedProjectIds: [] })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ pinnedProjectIds: [] })
  }

  const { data, error } = await supabase
    .from('pinned_projects')
    .select('project_id')
    .order('pinned_at', { ascending: false })

  if (error) {
    console.error('Failed to fetch pinned projects:', error)
    return NextResponse.json({ pinnedProjectIds: [] })
  }

  return NextResponse.json({
    pinnedProjectIds: data.map((row: { project_id: string }) => row.project_id),
  })
}

/**
 * POST /api/pinned-projects
 *
 * Pins a project for the current user.
 * Body: { projectId: string }
 */
export async function POST(request: Request) {
  const { supabase } = createSupabaseRouteClient(request)
  if (!supabase) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { projectId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pinned_projects')
    .upsert(
      { user_id: user.id, project_id: body.projectId },
      { onConflict: 'user_id,project_id' }
    )

  if (error) {
    console.error('Failed to pin project:', error)
    return NextResponse.json({ error: 'Failed to pin project' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}

/**
 * DELETE /api/pinned-projects
 *
 * Unpins a project for the current user.
 * Body: { projectId: string }
 */
export async function DELETE(request: Request) {
  const { supabase } = createSupabaseRouteClient(request)
  if (!supabase) return NextResponse.json({ error: 'Auth not configured' }, { status: 500 })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  let body: { projectId?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  if (!body.projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const { error } = await supabase
    .from('pinned_projects')
    .delete()
    .eq('user_id', user.id)
    .eq('project_id', body.projectId)

  if (error) {
    console.error('Failed to unpin project:', error)
    return NextResponse.json({ error: 'Failed to unpin project' }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
