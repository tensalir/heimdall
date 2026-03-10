/**
 * Restore run tracking for briefing page rollbacks.
 * Runs are operator-initiated; items track per-page restore outcomes.
 */

import { getSupabase } from '../../lib/supabase.js'

export type RestoreSelectionMode = 'single_version' | 'page_point_in_time' | 'file_point_in_time'
export type RestoreRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'partial'
export type RestoreMode = 'restore_copy' | 'in_place'
export type RestoreItemStatus = 'queued' | 'running' | 'completed' | 'failed' | 'skipped'

export interface RestoreRunRow {
  id: string
  requested_by: string | null
  request_source: string
  selection_mode: RestoreSelectionMode
  figma_file_key: string | null
  figma_file_name: string | null
  requested_restore_to: string | null
  status: RestoreRunStatus
  params: Record<string, unknown>
  result_summary: Record<string, unknown>
  error: string | null
  requested_at: string
  started_at: string | null
  completed_at: string | null
}

export interface RestoreItemRow {
  id: string
  restore_run_id: string
  sync_id: string | null
  target_version_id: string
  monday_item_id: string
  figma_file_key: string
  figma_page_id: string | null
  figma_page_name: string | null
  restore_mode: RestoreMode
  status: RestoreItemStatus
  result_version_id: string | null
  result_page_id: string | null
  error_code: string | null
  created_at: string
  completed_at: string | null
}

export async function createRestoreRun(input: {
  requestedBy?: string | null
  selectionMode: RestoreSelectionMode
  figmaFileKey?: string | null
  figmaFileName?: string | null
  requestedRestoreTo?: string | null
  params?: Record<string, unknown>
}): Promise<RestoreRunRow | null> {
  const db = getSupabase()
  if (!db) return null

  const { data, error } = await db
    .from('briefing_restore_runs')
    .insert({
      requested_by: input.requestedBy ?? null,
      selection_mode: input.selectionMode,
      figma_file_key: input.figmaFileKey ?? null,
      figma_file_name: input.figmaFileName ?? null,
      requested_restore_to: input.requestedRestoreTo ?? null,
      params: input.params ?? {},
    })
    .select()
    .single()

  if (error) {
    console.error('[briefingRestoreStore] createRestoreRun error:', error.message)
    return null
  }
  return data as RestoreRunRow
}

export async function addRestoreItem(input: {
  restoreRunId: string
  syncId?: string | null
  targetVersionId: string
  mondayItemId: string
  figmaFileKey: string
  figmaPageId?: string | null
  figmaPageName?: string | null
  restoreMode?: RestoreMode
}): Promise<RestoreItemRow | null> {
  const db = getSupabase()
  if (!db) return null

  const { data, error } = await db
    .from('briefing_restore_items')
    .insert({
      restore_run_id: input.restoreRunId,
      sync_id: input.syncId ?? null,
      target_version_id: input.targetVersionId,
      monday_item_id: input.mondayItemId,
      figma_file_key: input.figmaFileKey,
      figma_page_id: input.figmaPageId ?? null,
      figma_page_name: input.figmaPageName ?? null,
      restore_mode: input.restoreMode ?? 'restore_copy',
    })
    .select()
    .single()

  if (error) {
    console.error('[briefingRestoreStore] addRestoreItem error:', error.message)
    return null
  }
  return data as RestoreItemRow
}

export async function updateRestoreRunStatus(
  runId: string,
  status: RestoreRunStatus,
  patch?: { resultSummary?: Record<string, unknown>; error?: string }
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const update: Record<string, unknown> = { status }
  if (status === 'running') update.started_at = new Date().toISOString()
  if (status === 'completed' || status === 'failed' || status === 'partial') {
    update.completed_at = new Date().toISOString()
  }
  if (patch?.resultSummary) update.result_summary = patch.resultSummary
  if (patch?.error) update.error = patch.error

  const { error } = await db
    .from('briefing_restore_runs')
    .update(update)
    .eq('id', runId)
  return !error
}

export async function updateRestoreItemStatus(
  itemId: string,
  status: RestoreItemStatus,
  patch?: { resultVersionId?: string; resultPageId?: string; errorCode?: string }
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const update: Record<string, unknown> = { status }
  if (status === 'completed' || status === 'failed') {
    update.completed_at = new Date().toISOString()
  }
  if (patch?.resultVersionId) update.result_version_id = patch.resultVersionId
  if (patch?.resultPageId) update.result_page_id = patch.resultPageId
  if (patch?.errorCode) update.error_code = patch.errorCode

  const { error } = await db
    .from('briefing_restore_items')
    .update(update)
    .eq('id', itemId)
  return !error
}

export async function getRestoreRun(runId: string): Promise<RestoreRunRow | null> {
  const db = getSupabase()
  if (!db) return null
  const { data } = await db
    .from('briefing_restore_runs')
    .select('*')
    .eq('id', runId)
    .maybeSingle()
  return (data as RestoreRunRow) ?? null
}

export async function getRestoreItems(runId: string): Promise<RestoreItemRow[]> {
  const db = getSupabase()
  if (!db) return []
  const { data, error } = await db
    .from('briefing_restore_items')
    .select('*')
    .eq('restore_run_id', runId)
    .order('created_at')
  if (error) return []
  return (data ?? []) as RestoreItemRow[]
}

export async function getPendingRestoreItems(
  figmaFileKey: string
): Promise<RestoreItemRow[]> {
  const db = getSupabase()
  if (!db) return []
  const { data, error } = await db
    .from('briefing_restore_items')
    .select('*')
    .eq('figma_file_key', figmaFileKey)
    .eq('status', 'queued')
    .order('created_at')
  if (error) return []
  return (data ?? []) as RestoreItemRow[]
}
