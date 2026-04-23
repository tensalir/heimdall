/**
 * Ops feedback review store: CRUD for ops_feedback_reviews.
 * Used by the feedback tab in the /ops board modal and the summarize/sync APIs.
 */

import { getSupabase } from '../../lib/supabase.js'

export interface OpsFeedbackReview {
  id: string
  board_item_id: string
  monday_item_id: string
  monday_board_id: string
  briefing_doc_cache: string | null
  feedback_doc_cache: string | null
  feedback_doc_id: string | null
  parsed_feedback: Record<string, unknown>
  generated_summary: string | null
  contradiction_note: string | null
  summary_model: string | null
  generated_at: string | null
  summary_draft: string | null
  draft_updated_at: string | null
  synced_to_monday: boolean
  synced_at: string | null
  synced_summary: string | null
  monday_status_set: string | null
  created_at: string
  updated_at: string
}

export async function getReview(
  mondayItemId: string,
  mondayBoardId: string
): Promise<OpsFeedbackReview | null> {
  const db = getSupabase()
  if (!db) return null
  const { data, error } = await db
    .from('ops_feedback_reviews')
    .select('*')
    .eq('monday_item_id', mondayItemId)
    .eq('monday_board_id', mondayBoardId)
    .maybeSingle()
  if (error || !data) return null
  return data as OpsFeedbackReview
}

export async function upsertReview(
  input: {
    boardItemId: string
    mondayItemId: string
    mondayBoardId: string
  } & Partial<Pick<
    OpsFeedbackReview,
    | 'briefing_doc_cache'
    | 'feedback_doc_cache'
    | 'feedback_doc_id'
    | 'parsed_feedback'
    | 'generated_summary'
    | 'contradiction_note'
    | 'summary_model'
    | 'generated_at'
    | 'summary_draft'
    | 'draft_updated_at'
    | 'synced_to_monday'
    | 'synced_at'
    | 'synced_summary'
    | 'monday_status_set'
  >>
): Promise<OpsFeedbackReview | null> {
  const db = getSupabase()
  if (!db) return null

  const now = new Date().toISOString()
  const {
    boardItemId,
    mondayItemId,
    mondayBoardId,
    ...patch
  } = input

  const { data, error } = await db
    .from('ops_feedback_reviews')
    .upsert(
      {
        board_item_id: boardItemId,
        monday_item_id: mondayItemId,
        monday_board_id: mondayBoardId,
        ...patch,
        updated_at: now,
      },
      { onConflict: 'monday_item_id,monday_board_id' }
    )
    .select()
    .single()

  if (error) {
    console.error('[opsFeedbackStore] upsertReview error:', error.message)
    return null
  }
  return data as OpsFeedbackReview
}

export async function saveDraft(
  mondayItemId: string,
  mondayBoardId: string,
  draft: string
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false
  const now = new Date().toISOString()
  const { error } = await db
    .from('ops_feedback_reviews')
    .update({
      summary_draft: draft,
      draft_updated_at: now,
      updated_at: now,
    })
    .eq('monday_item_id', mondayItemId)
    .eq('monday_board_id', mondayBoardId)
  return !error
}

export async function markSynced(
  mondayItemId: string,
  mondayBoardId: string,
  summary: string,
  statusSet: string
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false
  const now = new Date().toISOString()
  const { error } = await db
    .from('ops_feedback_reviews')
    .update({
      synced_to_monday: true,
      synced_at: now,
      synced_summary: summary,
      monday_status_set: statusSet,
      updated_at: now,
    })
    .eq('monday_item_id', mondayItemId)
    .eq('monday_board_id', mondayBoardId)
  return !error
}

/**
 * Return the set of monday_item_id values that have been reviewed and synced
 * back to Monday via Heimdall for a given board.
 */
export async function getSyncedFeedbackItemIds(mondayBoardId: string): Promise<Set<string>> {
  const db = getSupabase()
  if (!db) return new Set()
  const { data } = await db
    .from('ops_feedback_reviews')
    .select('monday_item_id')
    .eq('monday_board_id', mondayBoardId)
    .eq('synced_to_monday', true)
  return new Set((data ?? []).map((r) => r.monday_item_id))
}

/**
 * Parse a Monday feedback doc into a structured version/variation map.
 * Expected template: version headings (v1, v2, ...) with per-variation sub-sections.
 */
export function parseFeedbackDoc(markdown: string): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {}
  if (!markdown) return result

  const lines = markdown.split('\n')
  let currentVersion = ''
  let currentVariation = ''
  let currentLines: string[] = []

  const flush = () => {
    if (currentVersion && currentVariation && currentLines.length > 0) {
      if (!result[currentVersion]) result[currentVersion] = {}
      result[currentVersion][currentVariation] = currentLines.join('\n').trim()
    }
    currentLines = []
  }

  for (const line of lines) {
    const versionMatch = line.match(/^##?\s*(v\d+)/i)
    if (versionMatch) {
      flush()
      currentVersion = versionMatch[1].toLowerCase()
      currentVariation = ''
      continue
    }

    const variationMatch = line.match(/^###?\s*(variation\s*\d+)/i)
    if (variationMatch) {
      flush()
      currentVariation = variationMatch[1].toLowerCase().replace(/\s+/g, '_')
      continue
    }

    if (currentVersion) {
      if (!currentVariation) {
        currentVariation = '_general'
      }
      currentLines.push(line)
    }
  }
  flush()

  return result
}
