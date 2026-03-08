import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

function mapRow(r: Record<string, unknown>) {
  return {
    id: r.id,
    run_id: r.run_id,
    month_key: r.month_key,
    row_index: r.row_index,
    siobhanRef: r.siobhan_ref ?? '',
    contentBucket: r.content_bucket ?? '',
    static: Number(r.static_count ?? 0),
    video: Number(r.video_count ?? 0),
    carousel: Number(r.carousel_count ?? 0),
    ideationStarter: r.ideation_starter ?? '',
    experimentName: r.experiment_name ?? '',
    notes: r.notes ?? '',
    typeUseCase: r.type_use_case ?? '',
    briefOwner: r.brief_owner ?? '',
    localisationOrGrowth: r.localisation_or_growth ?? '',
    studioAgency: r.studio_agency ?? '',
    agencyRef: r.agency_ref ?? '',
    numAssets: Number(r.num_assets ?? 0),
  }
}

/**
 * GET /api/forecast/runs/[runId]/cs-detail-rows?monthKey=May26
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { runId } = await params
  const { searchParams } = new URL(req.url ?? '', 'http://localhost')
  const monthKey = searchParams.get('monthKey') ?? ''
  if (!runId || !monthKey) {
    return NextResponse.json({ error: 'runId and monthKey required' }, { status: 400 })
  }

  const { data, error } = await db
    .from('forecast_cs_detail_rows')
    .select('*')
    .eq('run_id', runId)
    .eq('month_key', monthKey)
    .order('row_index', { ascending: true })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ rows: (data ?? []).map(mapRow) })
}

/**
 * POST /api/forecast/runs/[runId]/cs-detail-rows
 * Body: { monthKey, siobhanRef?, contentBucket?, static?, video?, carousel?, ... }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { runId } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const monthKey = body.monthKey as string
  if (!runId || !monthKey) {
    return NextResponse.json({ error: 'runId and monthKey required' }, { status: 400 })
  }

  const { data: existing } = await db
    .from('forecast_cs_detail_rows')
    .select('row_index')
    .eq('run_id', runId)
    .eq('month_key', monthKey)
    .order('row_index', { ascending: false })
    .limit(1)
    .single()

  const rowIndex = (existing?.row_index ?? -1) + 1

  const insert = {
    run_id: runId,
    month_key: monthKey,
    row_index: rowIndex,
    siobhan_ref: (body.siobhanRef as string) ?? `AP${rowIndex + 1}`,
    content_bucket: (body.contentBucket as string) ?? '',
    static_count: Math.max(0, Number(body.static ?? 0)),
    video_count: Math.max(0, Number(body.video ?? 0)),
    carousel_count: Math.max(0, Number(body.carousel ?? 0)),
    ideation_starter: (body.ideationStarter as string) ?? '',
    experiment_name: (body.experimentName as string) ?? '',
    notes: (body.notes as string) ?? '',
    type_use_case: (body.typeUseCase as string) ?? '',
    brief_owner: (body.briefOwner as string) ?? '',
    localisation_or_growth: (body.localisationOrGrowth as string) ?? '',
    studio_agency: (body.studioAgency as string) ?? '',
    agency_ref: (body.agencyRef as string) ?? '',
  }

  const { data: row, error } = await db
    .from('forecast_cs_detail_rows')
    .insert(insert)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(mapRow(row as Record<string, unknown>))
}

/**
 * PATCH /api/forecast/runs/[runId]/cs-detail-rows
 * Body: { id, ...fields to update }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { runId } = await params
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const id = body.id as string
  if (!id) {
    return NextResponse.json({ error: 'id required' }, { status: 400 })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.siobhan_ref !== undefined) update.siobhan_ref = body.siobhan_ref
  if (body.content_bucket !== undefined) update.content_bucket = body.content_bucket
  if (body.static_count !== undefined) update.static_count = Math.max(0, Number(body.static_count))
  if (body.video_count !== undefined) update.video_count = Math.max(0, Number(body.video_count))
  if (body.carousel_count !== undefined) update.carousel_count = Math.max(0, Number(body.carousel_count))
  if (body.ideation_starter !== undefined) update.ideation_starter = body.ideation_starter
  if (body.experiment_name !== undefined) update.experiment_name = body.experiment_name
  if (body.notes !== undefined) update.notes = body.notes
  if (body.type_use_case !== undefined) update.type_use_case = body.type_use_case
  if (body.brief_owner !== undefined) update.brief_owner = body.brief_owner
  if (body.studio_agency !== undefined) update.studio_agency = body.studio_agency
  if (body.agency_ref !== undefined) update.agency_ref = body.agency_ref
  if (body.contentBucket !== undefined) update.content_bucket = body.contentBucket
  if (body.static !== undefined) update.static_count = Math.max(0, Number(body.static))
  if (body.video !== undefined) update.video_count = Math.max(0, Number(body.video))
  if (body.carousel !== undefined) update.carousel_count = Math.max(0, Number(body.carousel))
  if (body.ideationStarter !== undefined) update.ideation_starter = body.ideationStarter
  if (body.experimentName !== undefined) update.experiment_name = body.experimentName
  if (body.typeUseCase !== undefined) update.type_use_case = body.typeUseCase
  if (body.briefOwner !== undefined) update.brief_owner = body.briefOwner
  if (body.studioAgency !== undefined) update.studio_agency = body.studioAgency
  if (body.agencyRef !== undefined) update.agency_ref = body.agencyRef
  if (body.localisationOrGrowth !== undefined) update.localisation_or_growth = body.localisationOrGrowth
  if (body.siobhanRef !== undefined) update.siobhan_ref = body.siobhanRef

  const { data, error } = await db
    .from('forecast_cs_detail_rows')
    .update(update)
    .eq('id', id)
    .eq('run_id', runId)
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(mapRow((data ?? {}) as Record<string, unknown>))
}

/**
 * DELETE /api/forecast/runs/[runId]/cs-detail-rows?id=uuid
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { runId } = await params
  const { searchParams } = new URL(req.url ?? '', 'http://localhost')
  const id = searchParams.get('id')
  if (!runId || !id) {
    return NextResponse.json({ error: 'runId and id required' }, { status: 400 })
  }

  const { error } = await db
    .from('forecast_cs_detail_rows')
    .delete()
    .eq('id', id)
    .eq('run_id', runId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
