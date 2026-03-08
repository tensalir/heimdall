import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const WorkingDocSectionsSchema = z.record(z.string(), z.string()).optional()

const PatchSchema = z.object({
  monday_item_id: z.string().optional().nullable(),
  figma_page_url: z.string().url().optional().nullable(),
  status: z.enum(['draft', 'edited', 'approved', 'synced_to_monday', 'queued']).optional(),
  target_board_id: z.string().nullable().optional(),
  brief_name: z.string().min(1).optional(),
  product_or_use_case: z.string().optional(),
  format: z.string().optional(),
  funnel: z.string().optional(),
  agency_ref: z.string().optional(),
  asset_count: z.number().int().min(1).optional(),
  working_doc_sections: WorkingDocSectionsSchema,
})

/**
 * PATCH /api/briefing-assistant/sprints/[sprintId]/assignments/[assignmentId]
 * Update a single assignment (e.g. after send-to-monday: set monday_item_id, figma_page_url, status).
 * assignmentId can be the DB uuid or client_id.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ sprintId: string; assignmentId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { sprintId, assignmentId } = await params
  if (!sprintId || !assignmentId) {
    return NextResponse.json({ error: 'sprintId and assignmentId required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = PatchSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (parsed.data.monday_item_id !== undefined) updates.monday_item_id = parsed.data.monday_item_id
  if (parsed.data.figma_page_url !== undefined) updates.figma_page_url = parsed.data.figma_page_url
  if (parsed.data.status !== undefined) updates.status = parsed.data.status
  if (parsed.data.target_board_id !== undefined) updates.target_board_id = parsed.data.target_board_id
  if (parsed.data.brief_name !== undefined) updates.brief_name = parsed.data.brief_name
  if (parsed.data.product_or_use_case !== undefined) updates.product_or_use_case = parsed.data.product_or_use_case
  if (parsed.data.format !== undefined) updates.format = parsed.data.format
  if (parsed.data.funnel !== undefined) updates.funnel = parsed.data.funnel
  if (parsed.data.agency_ref !== undefined) updates.agency_ref = parsed.data.agency_ref
  if (parsed.data.asset_count !== undefined) updates.asset_count = parsed.data.asset_count
  if (parsed.data.working_doc_sections !== undefined) updates.working_doc_sections = parsed.data.working_doc_sections

  const { data: byId } = await db
    .from('briefing_assignments')
    .select('id')
    .eq('sprint_id', sprintId)
    .eq('id', assignmentId)
    .single()

  const { data: byClientId } = byId
    ? { data: null }
    : await db
        .from('briefing_assignments')
        .select('id')
        .eq('sprint_id', sprintId)
        .eq('client_id', assignmentId)
        .single()

  const row = byId ?? byClientId
  if (!row) {
    return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })
  }

  const { error: updateErr } = await db
    .from('briefing_assignments')
    .update(updates)
    .eq('id', row.id)

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true })
}
