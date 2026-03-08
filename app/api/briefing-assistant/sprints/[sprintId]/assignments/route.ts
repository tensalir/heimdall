import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const AssignmentRowSchema = z.object({
  id: z.string(),
  contentBucket: z.enum(['bau', 'native_style', 'experimental']),
  ideationStarter: z.string(),
  productOrUseCase: z.string(),
  briefOwner: z.string(),
  agencyRef: z.string(),
  assetCount: z.number().int().min(1),
  format: z.string(),
  funnel: z.string(),
  campaignPartnership: z.string().optional(),
  batchKey: z.string(),
  briefName: z.string(),
  source: z.enum(['split', 'imported', 'manual']).optional(),
  mondayItemId: z.string().optional(),
  targetBoardId: z.string().nullable().optional(),
})

const BodySchema = z.object({
  batch_key: z.string(),
  batch_label: z.string(),
  assignments: z.array(AssignmentRowSchema),
})

/**
 * POST /api/briefing-assistant/sprints/[sprintId]/assignments
 * Replace assignments for this sprint and batch with the given list.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ sprintId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { sprintId } = await params
  if (!sprintId) {
    return NextResponse.json({ error: 'sprintId required' }, { status: 400 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = BodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validation failed', details: parsed.error.flatten() },
      { status: 400 }
    )
  }

  const { batch_key, batch_label, assignments } = parsed.data

  const { data: sprint } = await db.from('briefing_sprints').select('id').eq('id', sprintId).single()
  if (!sprint) {
    return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
  }

  await db.from('briefing_assignments').delete().eq('sprint_id', sprintId).eq('batch_key', batch_key)

  if (assignments.length > 0) {
    const rowsWithExtras = assignments.map((a) => ({
      sprint_id: sprintId,
      batch_key,
      client_id: a.id,
      content_bucket: a.contentBucket,
      ideation_starter: a.ideationStarter,
      product_or_use_case: a.productOrUseCase,
      brief_owner: a.briefOwner,
      agency_ref: a.agencyRef,
      asset_count: a.assetCount,
      format: a.format,
      funnel: a.funnel,
      campaign_partnership: a.campaignPartnership ?? null,
      brief_name: a.briefName,
      status: 'draft',
      source: a.source ?? 'split',
      monday_item_id: a.mondayItemId ?? null,
      target_board_id: a.targetBoardId ?? null,
    }))
    const rowsMinimal = assignments.map((a) => ({
      sprint_id: sprintId,
      batch_key,
      client_id: a.id,
      content_bucket: a.contentBucket,
      ideation_starter: a.ideationStarter,
      product_or_use_case: a.productOrUseCase,
      brief_owner: a.briefOwner,
      agency_ref: a.agencyRef,
      asset_count: a.assetCount,
      format: a.format,
      funnel: a.funnel,
      campaign_partnership: a.campaignPartnership ?? null,
      brief_name: a.briefName,
      status: 'draft',
      monday_item_id: a.mondayItemId ?? null,
    }))
    const { error: insertErr } = await db.from('briefing_assignments').insert(rowsWithExtras)
    if (insertErr) {
      const { error: fallbackErr } = await db.from('briefing_assignments').insert(rowsMinimal)
      if (fallbackErr) {
        return NextResponse.json({ error: fallbackErr.message }, { status: 500 })
      }
    }
  }

  return NextResponse.json({ ok: true, count: assignments.length })
}
