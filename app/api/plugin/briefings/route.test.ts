/**
 * Regression tests for the Figma plugin briefings route.
 *
 * Background: Monday's items_page query combines multiple rules with
 * `operator: and`, so when the plugin pushed two values for the same column
 * (e.g. Creative Partner = "Studio" AND Creative Partner = "Content Creation")
 * Monday silently returned zero rows even though each value matched a
 * different subset of the batch. The plugin's "no briefings available"
 * symptom in Figma comes from that empty response. The route now filters
 * Status and Creative Partner allowlists locally with OR semantics; only the
 * Batch column is filtered upstream.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

import type {
  BoardColumnSchema,
  MondayBoardItemRow,
  MondayFilterRule,
  ReadBoardResult,
} from '@/src/services/mondayBoardReader'

const SCHEMA: BoardColumnSchema[] = [
  { id: 'name', title: 'Name', type: 'name', settings_str: null },
  {
    id: 'status',
    title: 'Status',
    type: 'status',
    settings_str: '{"labels":{"0":"Brief WIP","1":"Brief ready / approved"}}',
  },
  {
    id: 'color_partner',
    title: 'Creative Partner',
    type: 'status',
    settings_str: '{"labels":{"0":"Studio","1":"Content Creation"}}',
  },
  {
    id: 'color_batch',
    title: 'Batch',
    type: 'status',
    settings_str: '{"labels":{"0":"May","1":"June","2":"July"}}',
  },
]

interface RowSeed {
  id: string
  name: string
  status: string
  partner: string
  batch: string
}

const JUNE_ROWS: RowSeed[] = [
  // Brief ready / approved + Studio (4 rows)
  { id: '1', name: 'CAM-Studio-Ready-1', status: 'Brief ready / approved', partner: 'Studio', batch: 'June' },
  { id: '2', name: 'CAM-Studio-Ready-2', status: 'Brief ready / approved', partner: 'Studio', batch: 'June' },
  { id: '3', name: 'CAM-Studio-Ready-3', status: 'Brief ready / approved', partner: 'Studio', batch: 'June' },
  { id: '4', name: 'CAM-Studio-Ready-4', status: 'Brief ready / approved', partner: 'Studio', batch: 'June' },

  // Brief ready / approved + Content Creation (3 rows)
  { id: '5', name: 'EXP-CC-Ready-1', status: 'Brief ready / approved', partner: 'Content Creation', batch: 'June' },
  { id: '6', name: 'EXP-CC-Ready-2', status: 'Brief ready / approved', partner: 'Content Creation', batch: 'June' },
  { id: '7', name: 'EXP-CC-Ready-3', status: 'Brief ready / approved', partner: 'Content Creation', batch: 'June' },

  // Wrong status (should be excluded)
  { id: '8', name: 'EXP-Studio-WIP', status: 'Brief WIP', partner: 'Studio', batch: 'June' },
  { id: '9', name: 'EXP-CC-WIP', status: 'Brief WIP', partner: 'Content Creation', batch: 'June' },

  // Wrong partner (should be excluded)
  { id: '10', name: 'CAM-Gain-Ready', status: 'Brief ready / approved', partner: 'Gain', batch: 'June' },
]

function rowFor(seed: RowSeed): MondayBoardItemRow {
  return {
    id: seed.id,
    name: seed.name,
    column_values: [
      { id: 'status', text: seed.status, column: { title: 'Status' } },
      { id: 'color_partner', text: seed.partner, column: { title: 'Creative Partner' } },
      { id: 'color_batch', text: seed.batch, column: { title: 'Batch' } },
    ],
  }
}

const fetchBoardSchemaMock = vi.fn<() => Promise<BoardColumnSchema[]>>()
const readFilteredBoardItemsMock = vi.fn<
  (boardId: string, rules: MondayFilterRule[]) => Promise<ReadBoardResult>
>()
const getProjectFilesMock = vi.fn<() => Promise<Array<{ key: string; name: string }>>>()
const getSyncsForFileMock = vi.fn<() => Promise<unknown[]>>()
const upsertSyncMock = vi.fn<() => Promise<unknown>>()
const appendImportEventMock = vi.fn<() => Promise<unknown>>()
const updateItemPipelineStatusMock = vi.fn<() => Promise<boolean>>()

vi.mock('@/src/services/mondayBoardReader', async () => {
  const actual = await vi.importActual<typeof import('@/src/services/mondayBoardReader')>(
    '@/src/services/mondayBoardReader',
  )
  return {
    ...actual,
    fetchBoardSchema: (...args: Parameters<typeof actual.fetchBoardSchema>) =>
      fetchBoardSchemaMock(...args),
    readFilteredBoardItems: (...args: Parameters<typeof actual.readFilteredBoardItems>) =>
      readFilteredBoardItemsMock(...args),
  }
})

vi.mock('@/src/integrations/figma/restClient', () => ({
  getProjectFiles: (...args: unknown[]) => getProjectFilesMock(...(args as [])),
}))

vi.mock('@/src/services/briefingSyncStore', () => ({
  getSyncsForFile: (...args: unknown[]) => getSyncsForFileMock(...(args as [])),
  upsertSync: (...args: unknown[]) => upsertSyncMock(...(args as [])),
  appendImportEvent: (...args: unknown[]) => appendImportEventMock(...(args as [])),
}))

vi.mock('@/src/services/opsBoardStore', () => ({
  updateItemPipelineStatus: (...args: unknown[]) => updateItemPipelineStatusMock(...(args as [])),
}))

async function postBriefings(body: unknown) {
  const { POST } = await import('./route')
  const req = new NextRequest('http://localhost/api/plugin/briefings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const res = await POST(req)
  return res.json() as Promise<{
    batch?: string
    batchLabel?: string
    itemCount?: number
    items?: Array<{ id: string; name: string; status: string; batch: string }>
    error?: string
    needsBatchSelection?: boolean
  }>
}

describe('POST /api/plugin/briefings — partner allowlist OR semantics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // getEnv() in src/config/env.ts caches its parsed env on first read.
    // Reset modules so each test sees fresh PLUGIN_FILTER_* env values.
    vi.resetModules()
    delete process.env.PLUGIN_FILTER_STATUS
    delete process.env.PLUGIN_FILTER_CREATIVE_PARTNER
    process.env.MONDAY_BOARD_ID = '18404406006'

    fetchBoardSchemaMock.mockResolvedValue(SCHEMA)
    readFilteredBoardItemsMock.mockImplementation(async (_boardId, _rules) => {
      // Simulate Monday's batch-only upstream filtering: only return June rows.
      return { items: JUNE_ROWS.map(rowFor), boardFound: true }
    })
    getProjectFilesMock.mockResolvedValue([])
    getSyncsForFileMock.mockResolvedValue([])
    upsertSyncMock.mockResolvedValue(null)
    appendImportEventMock.mockResolvedValue(null)
    updateItemPipelineStatusMock.mockResolvedValue(true)
  })

  it('returns rows for both Studio AND Content Creation partners (OR semantics)', async () => {
    const json = await postBriefings({
      fileName: 'JUNE 2026 - PerformanceAds',
      fileKey: 'fakeFigmaKey',
    })

    expect(json.error).toBeUndefined()
    expect(json.batch).toBe('2026-06')
    expect(json.itemCount).toBe(7)
    const names = (json.items ?? []).map((i) => i.name).sort()
    expect(names).toEqual([
      'CAM-Studio-Ready-1',
      'CAM-Studio-Ready-2',
      'CAM-Studio-Ready-3',
      'CAM-Studio-Ready-4',
      'EXP-CC-Ready-1',
      'EXP-CC-Ready-2',
      'EXP-CC-Ready-3',
    ])
  })

  it('does not send Status or Creative Partner rules upstream to Monday', async () => {
    await postBriefings({
      fileName: 'JUNE 2026 - PerformanceAds',
      fileKey: 'fakeFigmaKey',
    })

    expect(readFilteredBoardItemsMock).toHaveBeenCalledTimes(1)
    const rules = readFilteredBoardItemsMock.mock.calls[0]![1]
    const upstreamColumnIds = rules.map((r) => r.column_id)
    expect(upstreamColumnIds).not.toContain('status')
    expect(upstreamColumnIds).not.toContain('color_partner')
    expect(upstreamColumnIds).toContain('color_batch')
  })

  it('still excludes rows that fail the local status or partner allowlist', async () => {
    const json = await postBriefings({
      fileName: 'JUNE 2026 - PerformanceAds',
      fileKey: 'fakeFigmaKey',
    })

    const names = (json.items ?? []).map((i) => i.name)
    expect(names).not.toContain('EXP-Studio-WIP')
    expect(names).not.toContain('EXP-CC-WIP')
    expect(names).not.toContain('CAM-Gain-Ready')
  })

  it('honors a custom PLUGIN_FILTER_CREATIVE_PARTNER allowlist (Studio only)', async () => {
    process.env.PLUGIN_FILTER_CREATIVE_PARTNER = 'studio'

    const json = await postBriefings({
      fileName: 'JUNE 2026 - PerformanceAds',
      fileKey: 'fakeFigmaKey',
    })

    expect(json.itemCount).toBe(4)
    const partners = new Set(
      (json.items ?? []).map((i) => i.name.split('-')[1]),
    )
    expect(partners).toEqual(new Set(['Studio']))
  })
})
