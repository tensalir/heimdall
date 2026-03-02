import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { updateItemPipelineStatus } from '@/src/services/opsBoardStore'

export const dynamic = 'force-dynamic'

/**
 * POST /api/ops/repair-syncs
 * Body: { file_key: string, page_names?: string[], reset_all?: boolean }
 * Removes briefing_syncs records for the listed page names (partial match)
 * in the given file, and resets their ops_board_items pipeline_status to
 * 'eligible' so they can be re-queued and re-processed.
 * If reset_all is true, clears ALL syncs for the file.
 */
export async function POST(request: NextRequest) {
  const body = await request.json()
  const fileKey = String(body.file_key ?? '').trim()
  const pageNames: string[] = Array.isArray(body.page_names) ? body.page_names : []
  const resetAll = body.reset_all === true

  if (!fileKey) {
    return NextResponse.json({ error: 'file_key required' }, { status: 400 })
  }
  if (!resetAll && pageNames.length === 0) {
    return NextResponse.json({ error: 'page_names[] or reset_all required' }, { status: 400 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not available' }, { status: 500 })
  }

  let query = db
    .from('briefing_syncs')
    .select('id, monday_item_id, monday_board_id, monday_item_name, figma_page_name')
    .eq('figma_file_key', fileKey)

  const { data: allSyncs, error: fetchErr } = await query
  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!allSyncs || allSyncs.length === 0) {
    return NextResponse.json({ sync_records_cleared: 0, items_reset: 0, message: 'No sync records found for this file' })
  }

  const toRepair = resetAll
    ? allSyncs
    : allSyncs.filter(s => {
        const name = s.monday_item_name ?? s.figma_page_name ?? ''
        return pageNames.some(pn => name.includes(pn) || pn.includes(name))
      })

  let cleared = 0
  let reset = 0

  for (const row of toRepair) {
    await db.from('briefing_syncs').delete().eq('id', row.id)
    cleared++
    try {
      await updateItemPipelineStatus(row.monday_item_id, row.monday_board_id, 'eligible')
      reset++
    } catch { /* item may not exist in ops_board_items */ }
  }

  return NextResponse.json({
    total_syncs_for_file: allSyncs.length,
    sync_records_cleared: cleared,
    items_reset: reset,
    cleared_names: toRepair.map(r => r.monday_item_name ?? r.figma_page_name),
  })
}
