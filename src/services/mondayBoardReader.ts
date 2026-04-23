/**
 * Shared Monday board reader: schema fetch, paginated item fetch, column enrichment.
 * Used by feedback sync, briefing batch dropdown, and future tools.
 */

import { mondayGraphql } from '../integrations/monday/client.js'

export interface MondayBoardColumn {
  id: string
  title: string
}

export interface MondayBoardItemRow {
  id: string
  name: string
  group?: { id: string; title: string } | null
  column_values: Array<{
    id: string
    title?: string
    column?: { title: string }
    text?: string
    value?: string
    type?: string
  }>
}

export interface MondayBoardPage {
  items: MondayBoardItemRow[]
  cursor: string | null
}

export interface ReadBoardResult {
  items: MondayBoardItemRow[]
  boardFound: boolean
}

/**
 * Fetch all items from a Monday board with pagination.
 * Enriches each item's column_values with column title from board schema.
 */
export async function readMondayBoardItems(
  boardId: string,
  options?: { limitPerPage?: number }
): Promise<MondayBoardItemRow[]> {
  const result = await readMondayBoardItemsWithMeta(boardId, options)
  return result.items
}

/**
 * Same as readMondayBoardItems but returns boardFound so callers can distinguish no-access from empty board.
 */
export async function readMondayBoardItemsWithMeta(
  boardId: string,
  options?: { limitPerPage?: number }
): Promise<ReadBoardResult> {
  const limit = options?.limitPerPage ?? 500
  const allItems: MondayBoardItemRow[] = []
  let cursor: string | null = null

  const firstPage = await mondayGraphql<{
    boards?: Array<{
      columns?: Array<{ id: string; title: string }>
      items_page?: { cursor: string | null; items: MondayBoardItemRow[] }
    }>
  }>(
    `query ($boardId: [ID!]!, $limit: Int!) {
      boards(ids: $boardId) {
        columns { id title }
        items_page(limit: $limit) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id text value type column { title } }
          }
        }
      }
    }`,
    { boardId: [boardId], limit }
  )

  const board = firstPage?.boards?.[0]
  if (!board) {
    return { items: [], boardFound: false }
  }
  if (!board.items_page) {
    return { items: [], boardFound: true }
  }

  const columnTitleMap = new Map<string, string>()
  for (const col of board.columns ?? []) {
    columnTitleMap.set(col.id, col.title)
  }

  function enrich(items: MondayBoardItemRow[]) {
    for (const item of items) {
      for (const cv of item.column_values) {
        cv.title = cv.column?.title ?? columnTitleMap.get(cv.id) ?? cv.id
      }
    }
  }

  enrich(board.items_page.items ?? [])
  allItems.push(...(board.items_page.items ?? []))
  cursor = board.items_page.cursor

  while (cursor) {
    const nextPage = await mondayGraphql<{
      next_items_page?: { cursor: string | null; items: MondayBoardItemRow[] }
    }>(
      `query ($cursor: String!, $limit: Int!) {
        next_items_page(cursor: $cursor, limit: $limit) {
          cursor
          items {
            id
            name
            group { id title }
            column_values { id text value type column { title } }
          }
        }
      }`,
      { cursor, limit }
    )
    const page = nextPage?.next_items_page
    if (!page?.items?.length) break
    enrich(page.items)
    allItems.push(...page.items)
    cursor = page.cursor
  }

  return { items: allItems, boardFound: true }
}

/**
 * Get distinct values for a column by title (e.g. "Batch").
 * Uses board reader and collects unique non-empty text values.
 */
export async function getDistinctColumnValues(
  boardId: string,
  columnTitle: string
): Promise<string[]> {
  const items = await readMondayBoardItems(boardId)
  const columnKey = columnTitle.toLowerCase().trim().replace(/\s+/g, '_')
  const seen = new Set<string>()
  for (const item of items) {
    for (const cv of item.column_values) {
      const title = (cv.title ?? '').toLowerCase().replace(/\s+/g, '_')
      if (title !== columnKey) continue
      const text = (cv.text ?? '').trim()
      if (text) seen.add(text)
    }
  }
  return Array.from(seen)
}

// ── Filtered board reader (server-side Monday filtering) ────────────────────

export interface BoardColumnSchema {
  id: string
  title: string
  type: string
  settings_str: string | null
}

export interface MondayFilterRule {
  column_id: string
  compare_value: string | string[]
  operator: 'contains_terms' | 'any_of' | 'not_any_of' | 'is_empty' | 'is_not_empty' | 'contains_text' | 'not_contains_text'
}

/**
 * Fetch board column schema (id, title, type, settings_str).
 * Cached per boardId for the lifetime of the process.
 */
const schemaCache = new Map<string, BoardColumnSchema[]>()

export async function fetchBoardSchema(boardId: string): Promise<BoardColumnSchema[]> {
  const cached = schemaCache.get(boardId)
  if (cached) return cached

  const data = await mondayGraphql<{
    boards?: Array<{
      columns?: BoardColumnSchema[]
    }>
  }>(
    `query ($boardId: [ID!]!) {
      boards(ids: $boardId) {
        columns { id title type settings_str }
      }
    }`,
    { boardId: [boardId] }
  )

  const columns = data?.boards?.[0]?.columns ?? []
  schemaCache.set(boardId, columns)
  return columns
}

/** Clear schema cache (useful for tests). */
export function clearSchemaCache(): void {
  schemaCache.clear()
}

/**
 * Resolve a column ID by its human-readable title (case-insensitive).
 * Returns the first match, or null if not found.
 */
export function resolveColumnId(
  schema: BoardColumnSchema[],
  ...titleCandidates: string[]
): string | null {
  for (const candidate of titleCandidates) {
    const normalized = candidate.toLowerCase().trim()
    const match = schema.find(
      (col) => col.title.toLowerCase().trim() === normalized
    )
    if (match) return match.id
  }
  return null
}

/**
 * Parse the status column settings_str.labels to get the mapping
 * of label index → label text. Returns an empty record if unparseable.
 */
export function parseStatusLabels(settingsStr: string | null | undefined): Record<string, string> {
  if (!settingsStr) return {}
  try {
    const settings = JSON.parse(settingsStr) as { labels?: Record<string, string> }
    return settings.labels ?? {}
  } catch {
    return {}
  }
}

/**
 * Build filter rules from human-readable allowlists and resolved column IDs.
 * Each allowlist entry becomes a separate contains_terms rule that Monday ORs
 * within the same column. Multiple rules across columns are ANDed by the caller.
 */
export function buildFilterRules(
  schema: BoardColumnSchema[],
  filters: Array<{
    titleCandidates: string[]
    values: string[]
  }>
): MondayFilterRule[] {
  const rules: MondayFilterRule[] = []
  for (const filter of filters) {
    if (filter.values.length === 0) continue
    const colId = resolveColumnId(schema, ...filter.titleCandidates)
    if (!colId) continue
    for (const value of filter.values) {
      rules.push({
        column_id: colId,
        compare_value: value,
        operator: 'contains_terms',
      })
    }
  }
  return rules
}

/**
 * Resolve a Heimdall canonical batch key (e.g. "2026-05") to the Monday
 * status-column label text used for the Batch column.
 *
 * Strategy: parse the Batch status column's settings_str.labels, then match
 * each label through parseBatchToCanonical to find the one whose canonical
 * key matches the requested batch.
 *
 * Returns null when the batch column is not found or no label matches,
 * signalling the caller to keep local batch filtering.
 */
export function resolveBatchLabel(
  schema: BoardColumnSchema[],
  canonicalBatchKey: string,
  parseBatch: (raw: string) => { canonicalKey: string } | null,
): string | null {
  const batchColId = resolveColumnId(schema, 'Batch', 'Batch Name')
  if (!batchColId) return null

  const col = schema.find((c) => c.id === batchColId)
  if (!col) return null

  const labels = parseStatusLabels(col.settings_str)
  for (const labelText of Object.values(labels)) {
    const parsed = parseBatch(labelText)
    if (parsed && parsed.canonicalKey === canonicalBatchKey) {
      return labelText
    }
  }

  return null
}

/**
 * Fetch items from a Monday board with server-side column filters applied.
 * Falls back to full-board fetch when no rules are provided or when the
 * filtered query fails (graceful degradation).
 */
export async function readFilteredBoardItems(
  boardId: string,
  rules: MondayFilterRule[],
  options?: { limitPerPage?: number }
): Promise<ReadBoardResult> {
  if (rules.length === 0) {
    return readMondayBoardItemsWithMeta(boardId, options)
  }

  const limit = options?.limitPerPage ?? 500

  const rulesGql = rules
    .map(
      (r) =>
        `{ column_id: ${JSON.stringify(r.column_id)}, compare_value: ${JSON.stringify(r.compare_value)}, operator: ${r.operator} }`
    )
    .join('\n            ')

  try {
    const firstPage = await mondayGraphql<{
      boards?: Array<{
        columns?: Array<{ id: string; title: string }>
        items_page?: { cursor: string | null; items: MondayBoardItemRow[] }
      }>
    }>(
      `query ($boardId: [ID!]!, $limit: Int!) {
        boards(ids: $boardId) {
          columns { id title }
          items_page(
            limit: $limit
            query_params: {
              rules: [
                ${rulesGql}
              ]
              operator: and
            }
          ) {
            cursor
            items {
              id
              name
              group { id title }
              column_values { id text value type column { title } }
            }
          }
        }
      }`,
      { boardId: [boardId], limit }
    )

    const board = firstPage?.boards?.[0]
    if (!board) {
      return { items: [], boardFound: false }
    }
    if (!board.items_page) {
      return { items: [], boardFound: true }
    }

    const columnTitleMap = new Map<string, string>()
    for (const col of board.columns ?? []) {
      columnTitleMap.set(col.id, col.title)
    }

    function enrich(items: MondayBoardItemRow[]) {
      for (const item of items) {
        for (const cv of item.column_values) {
          cv.title = cv.column?.title ?? columnTitleMap.get(cv.id) ?? cv.id
        }
      }
    }

    const allItems: MondayBoardItemRow[] = []

    enrich(board.items_page.items ?? [])
    allItems.push(...(board.items_page.items ?? []))
    let cursor = board.items_page.cursor

    while (cursor) {
      const nextPage = await mondayGraphql<{
        next_items_page?: { cursor: string | null; items: MondayBoardItemRow[] }
      }>(
        `query ($cursor: String!, $limit: Int!) {
          next_items_page(cursor: $cursor, limit: $limit) {
            cursor
            items {
              id
              name
              group { id title }
              column_values { id text value type column { title } }
            }
          }
        }`,
        { cursor, limit }
      )
      const page = nextPage?.next_items_page
      if (!page?.items?.length) break
      enrich(page.items)
      allItems.push(...page.items)
      cursor = page.cursor
    }

    return { items: allItems, boardFound: true }
  } catch (err) {
    console.warn('[mondayBoardReader] Filtered query failed, falling back to full fetch:', err instanceof Error ? err.message : err)
    return readMondayBoardItemsWithMeta(boardId, options)
  }
}
