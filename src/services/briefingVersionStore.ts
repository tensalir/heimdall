/**
 * Append-only version history for briefing page writes.
 * Every plugin mutation captures a page snapshot so changes can be browsed or restored.
 */

import { getSupabase } from '../../lib/supabase.js'

export type CapturePhase = 'pre_write' | 'post_write' | 'post_restore' | 'backfill'
export type OperationKind =
  | 'create'
  | 'update'
  | 'restore'
  | 'repair_backfill'
  | 'template_create'
  | 'layout_fix'
  | 'widget_migrate'
  | 'image_import'
export type VersionSource = 'plugin_sync' | 'webhook' | 'manual_queue' | 'admin_restore' | 'admin_backfill'

export interface PageVersionRow {
  id: string
  sync_id: string | null
  monday_item_id: string
  monday_board_id: string
  batch_canonical: string | null
  figma_file_key: string
  figma_page_id: string | null
  figma_page_name: string | null
  version_number: number
  capture_phase: CapturePhase
  operation_kind: OperationKind
  source: VersionSource
  idempotency_key: string | null
  page_snapshot: Record<string, unknown>
  input_snapshot: Record<string, unknown>
  monday_snapshot: Record<string, unknown>
  write_metadata: Record<string, unknown>
  page_hash: string | null
  prior_version_id: string | null
  restored_from_version_id: string | null
  created_at: string
}

export interface CaptureVersionInput {
  mondayItemId: string
  mondayBoardId: string
  batchCanonical?: string | null
  figmaFileKey: string
  figmaPageId?: string | null
  figmaPageName?: string | null
  capturePhase: CapturePhase
  operationKind: OperationKind
  source: VersionSource
  idempotencyKey?: string | null
  pageSnapshot?: Record<string, unknown>
  inputSnapshot?: Record<string, unknown>
  mondaySnapshot?: Record<string, unknown>
  writeMetadata?: Record<string, unknown>
  pageHash?: string | null
  syncId?: string | null
}

export async function captureVersion(input: CaptureVersionInput): Promise<PageVersionRow | null> {
  const db = getSupabase()
  if (!db) return null

  const latestVersion = await getLatestVersionNumber(
    input.mondayItemId,
    input.figmaFileKey
  )
  const nextVersion = latestVersion + 1

  const priorVersion = await getLatestVersion(input.mondayItemId, input.figmaFileKey)

  const row = {
    sync_id: input.syncId ?? null,
    monday_item_id: input.mondayItemId,
    monday_board_id: input.mondayBoardId,
    batch_canonical: input.batchCanonical ?? null,
    figma_file_key: input.figmaFileKey,
    figma_page_id: input.figmaPageId ?? null,
    figma_page_name: input.figmaPageName ?? null,
    version_number: nextVersion,
    capture_phase: input.capturePhase,
    operation_kind: input.operationKind,
    source: input.source,
    idempotency_key: input.idempotencyKey ?? null,
    page_snapshot: input.pageSnapshot ?? {},
    input_snapshot: input.inputSnapshot ?? {},
    monday_snapshot: input.mondaySnapshot ?? {},
    write_metadata: input.writeMetadata ?? {},
    page_hash: input.pageHash ?? null,
    prior_version_id: priorVersion?.id ?? null,
  }

  const { data, error } = await db
    .from('briefing_page_versions')
    .insert(row)
    .select()
    .single()

  if (error) {
    console.error('[briefingVersionStore] captureVersion error:', error.message)
    return null
  }

  if (input.syncId && input.capturePhase === 'post_write') {
    await db
      .from('briefing_syncs')
      .update({
        current_version_id: data.id,
        version: nextVersion,
      })
      .eq('id', input.syncId)
  }

  return data as PageVersionRow
}

export async function getLatestVersionNumber(
  mondayItemId: string,
  figmaFileKey: string
): Promise<number> {
  const db = getSupabase()
  if (!db) return 0
  const { data } = await db
    .from('briefing_page_versions')
    .select('version_number')
    .eq('monday_item_id', mondayItemId)
    .eq('figma_file_key', figmaFileKey)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return data?.version_number ?? 0
}

export async function getLatestVersion(
  mondayItemId: string,
  figmaFileKey: string
): Promise<PageVersionRow | null> {
  const db = getSupabase()
  if (!db) return null
  const { data } = await db
    .from('briefing_page_versions')
    .select('*')
    .eq('monday_item_id', mondayItemId)
    .eq('figma_file_key', figmaFileKey)
    .order('version_number', { ascending: false })
    .limit(1)
    .maybeSingle()
  return (data as PageVersionRow) ?? null
}

export async function getVersionHistory(
  mondayItemId: string,
  figmaFileKey: string,
  limit = 50
): Promise<PageVersionRow[]> {
  const db = getSupabase()
  if (!db) return []
  const { data, error } = await db
    .from('briefing_page_versions')
    .select('*')
    .eq('monday_item_id', mondayItemId)
    .eq('figma_file_key', figmaFileKey)
    .order('version_number', { ascending: false })
    .limit(limit)
  if (error) return []
  return (data ?? []) as PageVersionRow[]
}

export async function getVersionById(id: string): Promise<PageVersionRow | null> {
  const db = getSupabase()
  if (!db) return null
  const { data } = await db
    .from('briefing_page_versions')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  return (data as PageVersionRow) ?? null
}

export async function getVersionsForFile(
  figmaFileKey: string,
  opts?: { limit?: number; beforeDate?: string }
): Promise<PageVersionRow[]> {
  const db = getSupabase()
  if (!db) return []
  let query = db
    .from('briefing_page_versions')
    .select('*')
    .eq('figma_file_key', figmaFileKey)
  if (opts?.beforeDate) {
    query = query.lte('created_at', opts.beforeDate)
  }
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(opts?.limit ?? 100)
  if (error) return []
  return (data ?? []) as PageVersionRow[]
}
