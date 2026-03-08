import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/sprints/[sprintId]
 * Returns sprint with batches and assignments.
 */
export async function GET(
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

  const { data: sprint, error: sprintErr } = await db
    .from('briefing_sprints')
    .select('id, name, created_at, updated_at')
    .eq('id', sprintId)
    .single()

  if (sprintErr || !sprint) {
    return NextResponse.json({ error: 'Sprint not found' }, { status: 404 })
  }

  // Try with 006 columns first; fall back to minimal select if migration not run
  const batchCols = 'id, batch_key, batch_label, monday_board_id, figma_file_key'
  type BatchRow = { id: string; batch_key: string; batch_label: string; monday_board_id: string | null; figma_file_key: string | null; batch_type?: string }
  let batches: BatchRow[]
  const batchResult = await db
    .from('briefing_sprint_batches')
    .select(`${batchCols}, batch_type`)
    .eq('sprint_id', sprintId)
    .order('batch_key')
  if (batchResult.error) {
    const fallback = await db
      .from('briefing_sprint_batches')
      .select(batchCols)
      .eq('sprint_id', sprintId)
      .order('batch_key')
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    batches = (fallback.data ?? []).map((b) => ({ ...b, batch_type: 'monthly' }))
  } else {
    batches = (batchResult.data ?? []) as BatchRow[]
  }

  const assignCols = 'id, client_id, content_bucket, ideation_starter, product_or_use_case, brief_owner, agency_ref, asset_count, format, funnel, campaign_partnership, brief_name, monday_item_id, figma_page_url, status, batch_key, working_doc_sections'
  type AssignRow = Record<string, unknown> & { id: string; client_id?: string; content_bucket: string; batch_key: string; brief_name: string; monday_item_id?: string | null; figma_page_url?: string | null; status: string; source?: string; target_board_id?: string | null; working_doc_sections?: Record<string, string> | null }
  let assignments: AssignRow[]
  const assignResult = await db
    .from('briefing_assignments')
    .select(`${assignCols}, source, target_board_id`)
    .eq('sprint_id', sprintId)
    .order('brief_name')
  if (assignResult.error) {
    const fallbackCols = assignCols.replace(', working_doc_sections', '')
    const fallback = await db
      .from('briefing_assignments')
      .select(fallbackCols)
      .eq('sprint_id', sprintId)
      .order('brief_name')
    if (fallback.error) return NextResponse.json({ error: fallback.error.message }, { status: 500 })
    assignments = (fallback.data ?? []).map((a) => ({ ...a, source: 'split', target_board_id: null, working_doc_sections: {} })) as AssignRow[]
  } else {
    assignments = (assignResult.data ?? []) as AssignRow[]
  }

  const assignmentRows = assignments.map((a) => ({
    id: (a.client_id as string | undefined) ?? a.id,
    contentBucket: a.content_bucket,
    ideationStarter: a.ideation_starter,
    productOrUseCase: a.product_or_use_case,
    briefOwner: a.brief_owner,
    agencyRef: a.agency_ref,
    assetCount: a.asset_count,
    format: a.format,
    funnel: a.funnel,
    campaignPartnership: a.campaign_partnership ?? undefined,
    batchKey: a.batch_key,
    briefName: a.brief_name,
    mondayItemId: a.monday_item_id ?? undefined,
    figmaPageUrl: a.figma_page_url ?? undefined,
    status: a.status,
    source: (a.source as string) ?? 'split',
    targetBoardId: (a.target_board_id as string | null) ?? undefined,
    workingDocSections: (a.working_doc_sections as Record<string, string> | null) ?? undefined,
  }))

  return NextResponse.json({
    sprint: {
      id: sprint.id,
      name: sprint.name,
      created_at: sprint.created_at,
      updated_at: sprint.updated_at,
      batches: batches.map((b) => ({
        id: b.id,
        batch_key: b.batch_key,
        batch_label: b.batch_label,
        batch_type: b.batch_type ?? 'monthly',
        monday_board_id: b.monday_board_id,
        figma_file_key: b.figma_file_key,
      })),
      assignments: assignmentRows,
    },
  })
}
