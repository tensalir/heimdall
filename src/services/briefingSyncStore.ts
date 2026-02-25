/**
 * Sync record store for plugin: when Monday briefings are synced into Figma.
 * Used for preview (synced vs new) and future versioning/diff.
 */

import { getSupabase } from '../../lib/supabase.js'

export interface BriefingSyncRecord {
  id: string
  monday_item_id: string
  monday_board_id: string
  monday_item_name: string
  batch_canonical: string
  figma_file_key: string
  figma_page_id: string | null
  figma_page_name: string | null
  synced_at: string
  monday_snapshot: Record<string, unknown> | null
  version: number
  sync_status: string
}

export interface UpsertSyncInput {
  mondayItemId: string
  mondayBoardId: string
  mondayItemName: string
  batchCanonical: string
  figmaFileKey: string
  figmaPageId?: string | null
  figmaPageName?: string | null
  mondaySnapshot?: Record<string, unknown> | null
}

/**
 * All syncs for a Figma file (for preview badges).
 */
export async function getSyncsForFile(figmaFileKey: string): Promise<BriefingSyncRecord[]> {
  const db = getSupabase()
  if (!db) return []

  const { data, error } = await db
    .from('briefing_syncs')
    .select('*')
    .eq('figma_file_key', figmaFileKey)
    .order('synced_at', { ascending: false })

  if (error) return []
  return (data ?? []) as BriefingSyncRecord[]
}

/**
 * Single sync for a Monday item in a file (check if already synced).
 */
export async function getSyncForItem(
  mondayItemId: string,
  figmaFileKey: string
): Promise<BriefingSyncRecord | null> {
  const db = getSupabase()
  if (!db) return null

  const { data, error } = await db
    .from('briefing_syncs')
    .select('*')
    .eq('monday_item_id', mondayItemId)
    .eq('figma_file_key', figmaFileKey)
    .maybeSingle()

  if (error || !data) return null
  return data as BriefingSyncRecord
}

/**
 * Insert or update sync record. On conflict (monday_item_id, figma_file_key), bump version and update figma_page_id/name/snapshot.
 */
export async function upsertSync(input: UpsertSyncInput): Promise<BriefingSyncRecord | null> {
  const db = getSupabase()
  if (!db) return null

  const row = {
    monday_item_id: input.mondayItemId,
    monday_board_id: input.mondayBoardId,
    monday_item_name: input.mondayItemName,
    batch_canonical: input.batchCanonical,
    figma_file_key: input.figmaFileKey,
    figma_page_id: input.figmaPageId ?? null,
    figma_page_name: input.figmaPageName ?? null,
    monday_snapshot: input.mondaySnapshot ?? null,
    sync_status: 'synced',
  }

  const { data, error } = await db
    .from('briefing_syncs')
    .upsert(row, {
      onConflict: 'monday_item_id,figma_file_key',
      ignoreDuplicates: false,
    })
    .select()
    .single()

  if (error) return null
  return data as BriefingSyncRecord
}

/**
 * Update Figma page id/name after plugin completes (called from jobs/complete or plugin flow).
 */
export async function updateSyncFigmaPage(
  mondayItemId: string,
  figmaFileKey: string,
  figmaPageId: string | null,
  figmaPageName: string | null
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const { error } = await db
    .from('briefing_syncs')
    .update({
      figma_page_id: figmaPageId,
      figma_page_name: figmaPageName,
      synced_at: new Date().toISOString(),
    })
    .eq('monday_item_id', mondayItemId)
    .eq('figma_file_key', figmaFileKey)

  return !error
}

// ---------------------------------------------------------------------------
// Import event audit (full history for dedupe + diagnostics)
// ---------------------------------------------------------------------------

export type ImportEventSource = 'plugin_sync' | 'webhook' | 'manual_queue'
export type ImportEventOutcome = 'queued' | 'skipped_already_imported' | 'completed' | 'failed'

export interface BriefingImportEventRow {
  id: string
  monday_item_id: string
  monday_board_id: string
  monday_item_name: string
  batch_canonical: string
  figma_file_key: string
  figma_page_id: string | null
  figma_page_name: string | null
  idempotency_key: string | null
  source: ImportEventSource
  outcome: ImportEventOutcome
  reason: string | null
  error_code: string | null
  created_at: string
}

export interface AppendImportEventInput {
  mondayItemId: string
  mondayBoardId: string
  mondayItemName: string
  batchCanonical: string
  figmaFileKey: string
  figmaPageId?: string | null
  figmaPageName?: string | null
  idempotencyKey?: string | null
  source: ImportEventSource
  outcome: ImportEventOutcome
  reason?: string | null
  errorCode?: string | null
}

/**
 * True if this Monday item has been successfully imported into this Figma file (record in briefing_syncs with figma_page_id set).
 */
export async function hasSuccessfulImport(
  mondayItemId: string,
  figmaFileKey: string
): Promise<boolean> {
  const record = await getSyncForItem(mondayItemId, figmaFileKey)
  return record != null && record.figma_page_id != null && record.figma_page_id.trim() !== ''
}

/**
 * Append one import-attempt event to the audit table (full history).
 */
export async function appendImportEvent(input: AppendImportEventInput): Promise<BriefingImportEventRow | null> {
  const db = getSupabase()
  if (!db) return null

  const row = {
    monday_item_id: input.mondayItemId,
    monday_board_id: input.mondayBoardId,
    monday_item_name: input.mondayItemName,
    batch_canonical: input.batchCanonical,
    figma_file_key: input.figmaFileKey,
    figma_page_id: input.figmaPageId ?? null,
    figma_page_name: input.figmaPageName ?? null,
    idempotency_key: input.idempotencyKey ?? null,
    source: input.source,
    outcome: input.outcome,
    reason: input.reason ?? null,
    error_code: input.errorCode ?? null,
  }

  const { data, error } = await db.from('briefing_import_events').insert(row).select().single()
  if (error) return null
  return data as BriefingImportEventRow
}

/**
 * Fetch recent import events for diagnostics (optional).
 */
export async function getRecentImportEvents(limit = 50): Promise<BriefingImportEventRow[]> {
  const db = getSupabase()
  if (!db) return []

  const { data, error } = await db
    .from('briefing_import_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) return []
  return (data ?? []) as BriefingImportEventRow[]
}
