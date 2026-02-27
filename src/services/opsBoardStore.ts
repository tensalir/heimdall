/**
 * Ops board store: CRUD for ops_boards / ops_board_items.
 * Used by the /ops dashboard and auto-queue pipeline.
 */

import { getSupabase } from '../../lib/supabase.js'
import { readMondayBoardItemsWithMeta, type MondayBoardItemRow } from './mondayBoardReader.js'
import { columnMap, getCol } from '../integrations/monday/client.js'
import { parseBatchToCanonical } from '../domain/routing/batchToFile.js'

// ── Types ───────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | 'new'
  | 'eligible'
  | 'queued'
  | 'syncing'
  | 'synced'
  | 'failed'
  | 'skipped'

export interface OpsBoard {
  id: string
  monday_board_id: string
  board_name: string
  figma_project_id: string | null
  figma_project_name: string | null
  description: string | null
  auto_queue: boolean
  eligible_statuses: string[]
  default_creative_partners: string[]
  last_board_sync_at: string | null
  created_at: string
  updated_at: string
}

export interface OpsBoardSummary extends OpsBoard {
  total_items: number
  upcoming_count: number
  ready_for_figma_count: number
  imported_count: number
  exported_count: number
  queued_count: number
  syncing_count: number
  failed_count: number
  synced_count: number
}

export interface OpsBoardItem {
  id: string
  board_id: string
  monday_item_id: string
  monday_board_id: string
  item_name: string
  experiment_name: string | null
  batch_canonical: string | null
  batch_raw: string | null
  section_name: string | null
  monday_status: string | null
  pipeline_status: PipelineStatus
  creative_partner: string | null
  figma_file_key: string | null
  figma_page_id: string | null
  figma_page_url: string | null
  monday_snapshot: Record<string, unknown> | null
  queued_at: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
}

export interface CreateBoardInput {
  mondayBoardId: string
  boardName: string
  figmaProjectId?: string | null
  figmaProjectName?: string | null
  description?: string | null
  autoQueue?: boolean
  eligibleStatuses?: string[]
}

// ── Board CRUD ──────────────────────────────────────────────────────────────

export async function listBoardSummaries(): Promise<OpsBoardSummary[]> {
  const db = getSupabase()
  if (!db) return []
  const { data, error } = await db
    .from('ops_board_summary')
    .select('*')
    .order('board_name')
  if (error) {
    console.error('[opsBoardStore] listBoardSummaries error:', error.message)
    return []
  }
  return (data ?? []) as OpsBoardSummary[]
}

export async function getBoard(id: string): Promise<OpsBoard | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_boards')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  if (error || !data) return null
  return data as OpsBoard
}

export async function getBoardByMondayId(mondayBoardId: string): Promise<OpsBoard | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_boards')
    .select('*')
    .eq('monday_board_id', mondayBoardId)
    .maybeSingle()
  if (error || !data) return null
  return data as OpsBoard
}

export async function createBoard(input: CreateBoardInput): Promise<OpsBoard | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_boards')
    .insert({
      monday_board_id: input.mondayBoardId,
      board_name: input.boardName,
      figma_project_id: input.figmaProjectId ?? null,
      figma_project_name: input.figmaProjectName ?? null,
      description: input.description ?? null,
      auto_queue: input.autoQueue ?? true,
      eligible_statuses: input.eligibleStatuses ?? ['Brief ready / approved'],
    })
    .select()
    .single()
  if (error) {
    console.error('[opsBoardStore] createBoard error:', error.message)
    return null
  }
  return data as OpsBoard
}

export async function updateBoard(
  id: string,
  patch: Partial<Pick<OpsBoard, 'board_name' | 'figma_project_id' | 'figma_project_name' | 'description' | 'auto_queue' | 'eligible_statuses'>>
): Promise<OpsBoard | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_boards')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return null
  return data as OpsBoard
}

export async function deleteBoard(id: string): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false
  const { error } = await db.from('ops_boards').delete().eq('id', id)
  return !error
}

// ── Board Items ─────────────────────────────────────────────────────────────

export async function getBoardItems(
  boardId: string,
  opts?: { pipelineStatus?: PipelineStatus; limit?: number }
): Promise<OpsBoardItem[]> {
  const db = getSupabase()
  if (!db) return []
  let query = db
    .from('ops_board_items')
    .select('*')
    .eq('board_id', boardId)
    .order('updated_at', { ascending: false })
  if (opts?.pipelineStatus) {
    query = query.eq('pipeline_status', opts.pipelineStatus)
  }
  if (opts?.limit) {
    query = query.limit(opts.limit)
  }
  const { data, error } = await query
  if (error) return []
  return (data ?? []) as OpsBoardItem[]
}

export async function getItemByMondayId(
  mondayItemId: string,
  mondayBoardId: string
): Promise<OpsBoardItem | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_board_items')
    .select('*')
    .eq('monday_item_id', mondayItemId)
    .eq('monday_board_id', mondayBoardId)
    .maybeSingle()
  if (error || !data) return null
  return data as OpsBoardItem
}

export async function updateItemPipelineStatus(
  mondayItemId: string,
  mondayBoardId: string,
  pipelineStatus: PipelineStatus,
  patch?: Partial<Pick<OpsBoardItem, 'figma_file_key' | 'figma_page_id' | 'figma_page_url' | 'queued_at' | 'synced_at'>>
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false
  const { error } = await db
    .from('ops_board_items')
    .update({
      pipeline_status: pipelineStatus,
      updated_at: new Date().toISOString(),
      ...patch,
    })
    .eq('monday_item_id', mondayItemId)
    .eq('monday_board_id', mondayBoardId)
  return !error
}

// ── Board Sync ──────────────────────────────────────────────────────────────

function extractStatusFromItem(row: MondayBoardItemRow): string | null {
  for (const cv of row.column_values) {
    const title = (cv.title ?? cv.column?.title ?? '').toLowerCase()
    if (title === 'status' || title === 'brief_status' || title === 'brief status') {
      return (cv.text ?? '').trim() || null
    }
  }
  return null
}

function extractBatchFromItem(row: MondayBoardItemRow): { canonical: string | null; raw: string | null } {
  for (const cv of row.column_values) {
    const title = (cv.title ?? cv.column?.title ?? '').toLowerCase().replace(/\s+/g, '_')
    if (title === 'batch' || title === 'batch_name') {
      const raw = (cv.text ?? '').trim() || null
      if (!raw) return { canonical: null, raw: null }
      const parse = parseBatchToCanonical(raw)
      return { canonical: parse?.canonicalKey ?? null, raw }
    }
  }
  return { canonical: null, raw: null }
}

function extractCreativePartner(row: MondayBoardItemRow): string | null {
  for (const cv of row.column_values) {
    const title = (cv.title ?? cv.column?.title ?? '').toLowerCase().replace(/\s+/g, '_')
    if (title === 'creative_partner' || title === 'creativepartner' || title === 'creative_p') {
      return (cv.text ?? '').trim() || null
    }
  }
  return null
}

function buildMinimalSnapshot(row: MondayBoardItemRow): Record<string, unknown> {
  const snap: Record<string, unknown> = {}
  for (const cv of row.column_values) {
    const key = (cv.title ?? cv.column?.title ?? cv.id).toLowerCase().replace(/\s+/g, '_')
    const text = (cv.text ?? '').trim()
    if (text) snap[key] = text
  }
  return snap
}

/**
 * Sync all items from a Monday board into ops_board_items.
 * Upserts rows and resolves pipeline_status from Monday status column
 * cross-referenced with the board's eligible_statuses.
 */
export async function syncBoardItems(boardId: string): Promise<{
  total: number
  upserted: number
  errors: string[]
}> {
  const db = getSupabase()
  if (!db) return { total: 0, upserted: 0, errors: ['Supabase not configured'] }

  const board = await getBoard(boardId)
  if (!board) return { total: 0, upserted: 0, errors: ['Board not found'] }

  const { items, boardFound } = await readMondayBoardItemsWithMeta(board.monday_board_id)
  if (!boardFound) return { total: 0, upserted: 0, errors: ['Monday board not found or inaccessible'] }

  const eligibleSet = new Set(board.eligible_statuses.map(s => s.toLowerCase().trim()))

  const existingSyncs = await getExistingSyncsForBoard(board.monday_board_id)

  const errors: string[] = []
  let upserted = 0

  for (const row of items) {
    try {
      const mondayStatus = extractStatusFromItem(row)
      const batch = extractBatchFromItem(row)
      const creativePartner = extractCreativePartner(row)
      const col = columnMap({
        id: row.id,
        name: row.name,
        column_values: row.column_values,
      })
      const experimentName = row.name

      const alreadySynced = existingSyncs.has(row.id)
      let pipelineStatus: PipelineStatus = 'new'
      if (alreadySynced) {
        pipelineStatus = 'synced'
      } else if (mondayStatus && eligibleSet.has(mondayStatus.toLowerCase().trim())) {
        pipelineStatus = 'eligible'
      }

      const snapshot = buildMinimalSnapshot(row)

      const { error } = await db
        .from('ops_board_items')
        .upsert(
          {
            board_id: boardId,
            monday_item_id: row.id,
            monday_board_id: board.monday_board_id,
            item_name: row.name,
            experiment_name: experimentName,
            batch_canonical: batch.canonical,
            batch_raw: batch.raw,
            section_name: getCol(col, 'use_case', 'product', 'product_category', 'section', 'category') ?? null,
            monday_status: mondayStatus,
            pipeline_status: pipelineStatus,
            creative_partner: creativePartner,
            monday_snapshot: snapshot,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'monday_item_id,monday_board_id' }
        )

      if (error) {
        errors.push(`Item ${row.id}: ${error.message}`)
      } else {
        upserted++
      }
    } catch (err) {
      errors.push(`Item ${row.id}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  await db
    .from('ops_boards')
    .update({ last_board_sync_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', boardId)

  return { total: items.length, upserted, errors }
}

async function getExistingSyncsForBoard(mondayBoardId: string): Promise<Set<string>> {
  const db = getSupabase()
  if (!db) return new Set()
  const { data } = await db
    .from('briefing_syncs')
    .select('monday_item_id')
    .eq('monday_board_id', mondayBoardId)
  return new Set((data ?? []).map(r => r.monday_item_id))
}
