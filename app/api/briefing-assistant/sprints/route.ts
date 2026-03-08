import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const BatchSchema = z.discriminatedUnion('batch_type', [
  z.object({
    batch_type: z.literal('monthly'),
    batch_key: z.string().regex(/^\d{4}-\d{2}$/),
    batch_label: z.string(),
    monday_board_id: z.string().nullable().optional(),
    figma_file_key: z.string().nullable().optional(),
  }),
  z.object({
    batch_type: z.literal('campaign'),
    batch_key: z.string().regex(/^[a-z0-9][a-z0-9-]*$/i),
    batch_label: z.string(),
    monday_board_id: z.string().min(1),
    figma_file_key: z.string().nullable().optional(),
  }),
])

const CreateSprintSchema = z.object({
  name: z.string().min(1).max(200),
  batches: z.array(BatchSchema).optional(),
})

/**
 * GET /api/briefing-assistant/sprints
 * Returns list of sprints with batch count, assignment count, and batch details.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: sprints, error: sprintErr } = await db
    .from('briefing_sprints')
    .select('id, name, created_at, updated_at')
    .order('created_at', { ascending: false })

  if (sprintErr) {
    return NextResponse.json({ error: sprintErr.message }, { status: 500 })
  }

  if (!sprints?.length) {
    return NextResponse.json({ sprints: [] })
  }

  const sprintIds = sprints.map((s) => s.id)

  const batchCols = 'sprint_id, batch_key, batch_label, monday_board_id, figma_file_key'
  const batchResult = await db
    .from('briefing_sprint_batches')
    .select(`${batchCols}, batch_type`)
    .in('sprint_id', sprintIds)
  let batches: Array<{ sprint_id: string; batch_key: string; batch_label: string; monday_board_id: string | null; figma_file_key: string | null; batch_type?: string }>
  if (batchResult.error) {
    const fallback = await db.from('briefing_sprint_batches').select(batchCols).in('sprint_id', sprintIds)
    batches = (fallback.data ?? []).map((b) => ({ ...b, batch_type: 'monthly' }))
  } else {
    batches = (batchResult.data ?? []).map((b) => ({ ...b, batch_type: (b as { batch_type?: string }).batch_type ?? 'monthly' }))
  }

  const { data: assignmentCounts } = await db
    .from('briefing_assignments')
    .select('sprint_id')
    .in('sprint_id', sprintIds)

  const batchCountBySprint = new Map<string, number>()
  const assignmentCountBySprint = new Map<string, number>()
  const batchesBySprint = new Map<string, typeof batches>()

  for (const s of sprintIds) {
    batchCountBySprint.set(s, 0)
    assignmentCountBySprint.set(s, 0)
    batchesBySprint.set(s, [])
  }
  for (const b of batches) {
    batchCountBySprint.set(b.sprint_id, (batchCountBySprint.get(b.sprint_id) ?? 0) + 1)
    const list = batchesBySprint.get(b.sprint_id) ?? []
    list.push(b)
    batchesBySprint.set(b.sprint_id, list)
  }
  for (const a of assignmentCounts ?? []) {
    assignmentCountBySprint.set(a.sprint_id, (assignmentCountBySprint.get(a.sprint_id) ?? 0) + 1)
  }

  const result = sprints.map((s) => ({
    id: s.id,
    name: s.name,
    created_at: s.created_at,
    updated_at: s.updated_at,
    batch_count: batchCountBySprint.get(s.id) ?? 0,
    assignment_count: assignmentCountBySprint.get(s.id) ?? 0,
    batches: (batchesBySprint.get(s.id) ?? []).map((b: { batch_key: string; batch_label: string; batch_type?: string; monday_board_id: string | null; figma_file_key: string | null }) => ({
      batch_key: b.batch_key,
      batch_label: b.batch_label,
      batch_type: b.batch_type ?? 'monthly',
      monday_board_id: b.monday_board_id ?? null,
      figma_file_key: b.figma_file_key ?? null,
    })),
  }))

  return NextResponse.json({ sprints: result })
}

/**
 * POST /api/briefing-assistant/sprints
 * Body: { name, batches?: [{ batch_key, batch_label, monday_board_id?, figma_file_key? }] }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = CreateSprintSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { name, batches: batchList } = parsed.data

  const { data: sprint, error: sprintErr } = await db
    .from('briefing_sprints')
    .insert({ name })
    .select('id, name, created_at, updated_at')
    .single()

  if (sprintErr || !sprint) {
    return NextResponse.json({ error: sprintErr?.message ?? 'Failed to create sprint' }, { status: 500 })
  }

  if (batchList?.length) {
    const rowsWithType = batchList.map((b) => ({
      sprint_id: sprint.id,
      batch_key: b.batch_key,
      batch_label: b.batch_label,
      batch_type: b.batch_type,
      monday_board_id: b.monday_board_id ?? null,
      figma_file_key: b.figma_file_key ?? null,
    }))
    const rowsWithoutType = batchList.map((b) => ({
      sprint_id: sprint.id,
      batch_key: b.batch_key,
      batch_label: b.batch_label,
      monday_board_id: b.monday_board_id ?? null,
      figma_file_key: b.figma_file_key ?? null,
    }))
    const { error: batchErr } = await db.from('briefing_sprint_batches').insert(rowsWithType)
    if (batchErr) {
      const { error: fallbackErr } = await db.from('briefing_sprint_batches').insert(rowsWithoutType)
      if (fallbackErr) {
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      created_at: sprint.created_at,
      updated_at: sprint.updated_at,
      batches: batchList ?? [],
    },
  })
}
