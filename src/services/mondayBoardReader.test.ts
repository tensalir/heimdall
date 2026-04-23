import { describe, expect, it } from 'vitest'

import {
  resolveColumnId,
  parseStatusLabels,
  buildFilterRules,
  resolveBatchLabel,
  type BoardColumnSchema,
} from './mondayBoardReader.js'

const SAMPLE_SCHEMA: BoardColumnSchema[] = [
  { id: 'name', title: 'Name', type: 'name', settings_str: null },
  { id: 'status', title: 'Status', type: 'status', settings_str: '{"labels":{"0":"Working on it","1":"Done","5":""}}' },
  { id: 'color_mks0knr8', title: 'Creative Partner', type: 'status', settings_str: '{"labels":{"0":"Studio","1":"Gain","2":"Within","3":"Content Creation"}}' },
  { id: 'color_mks0f16k', title: 'Batch', type: 'status', settings_str: '{"labels":{"0":"MAY 2026","1":"APRIL 2026","2":"JUNE 2026"}}' },
  { id: 'text_col', title: 'Notes', type: 'text', settings_str: null },
]

describe('resolveColumnId', () => {
  it('finds a column by exact title (case-insensitive)', () => {
    expect(resolveColumnId(SAMPLE_SCHEMA, 'creative partner')).toBe('color_mks0knr8')
    expect(resolveColumnId(SAMPLE_SCHEMA, 'Creative Partner')).toBe('color_mks0knr8')
    expect(resolveColumnId(SAMPLE_SCHEMA, 'CREATIVE PARTNER')).toBe('color_mks0knr8')
  })

  it('tries multiple title candidates and returns first match', () => {
    expect(resolveColumnId(SAMPLE_SCHEMA, 'Nonexistent', 'Batch')).toBe('color_mks0f16k')
  })

  it('returns null when no candidate matches', () => {
    expect(resolveColumnId(SAMPLE_SCHEMA, 'Unknown Column')).toBeNull()
  })
})

describe('parseStatusLabels', () => {
  it('parses valid settings_str into labels map', () => {
    const labels = parseStatusLabels('{"labels":{"0":"Done","1":"WIP"}}')
    expect(labels).toEqual({ '0': 'Done', '1': 'WIP' })
  })

  it('returns empty object for null/undefined/invalid', () => {
    expect(parseStatusLabels(null)).toEqual({})
    expect(parseStatusLabels(undefined)).toEqual({})
    expect(parseStatusLabels('not json')).toEqual({})
    expect(parseStatusLabels('{}')).toEqual({})
  })
})

describe('buildFilterRules', () => {
  it('builds contains_terms rules for matched columns', () => {
    const rules = buildFilterRules(SAMPLE_SCHEMA, [
      { titleCandidates: ['Creative Partner'], values: ['studio', 'content creation'] },
      { titleCandidates: ['Status'], values: ['brief ready / approved'] },
    ])

    expect(rules).toHaveLength(3)
    expect(rules[0]).toEqual({
      column_id: 'color_mks0knr8',
      compare_value: 'studio',
      operator: 'contains_terms',
    })
    expect(rules[1]).toEqual({
      column_id: 'color_mks0knr8',
      compare_value: 'content creation',
      operator: 'contains_terms',
    })
    expect(rules[2]).toEqual({
      column_id: 'status',
      compare_value: 'brief ready / approved',
      operator: 'contains_terms',
    })
  })

  it('skips filters with empty values', () => {
    const rules = buildFilterRules(SAMPLE_SCHEMA, [
      { titleCandidates: ['Status'], values: [] },
    ])
    expect(rules).toHaveLength(0)
  })

  it('skips filters when column title is not found', () => {
    const rules = buildFilterRules(SAMPLE_SCHEMA, [
      { titleCandidates: ['Missing Column'], values: ['foo'] },
    ])
    expect(rules).toHaveLength(0)
  })

  it('tries multiple title candidates for the same filter', () => {
    const rules = buildFilterRules(SAMPLE_SCHEMA, [
      { titleCandidates: ['Creation Team', 'Creative Team', 'Creative Partner'], values: ['within'] },
    ])
    expect(rules).toHaveLength(1)
    expect(rules[0].column_id).toBe('color_mks0knr8')
  })
})

describe('resolveBatchLabel', () => {
  const mockParse = (raw: string) => {
    const months: Record<string, string> = {
      'MAY 2026': '2026-05',
      'APRIL 2026': '2026-04',
      'JUNE 2026': '2026-06',
    }
    const key = months[raw.toUpperCase()]
    return key ? { canonicalKey: key } : null
  }

  it('maps a canonical batch key to the Monday label text', () => {
    expect(resolveBatchLabel(SAMPLE_SCHEMA, '2026-05', mockParse)).toBe('MAY 2026')
    expect(resolveBatchLabel(SAMPLE_SCHEMA, '2026-04', mockParse)).toBe('APRIL 2026')
  })

  it('returns null when no label matches the canonical key', () => {
    expect(resolveBatchLabel(SAMPLE_SCHEMA, '2026-12', mockParse)).toBeNull()
  })

  it('returns null when the batch column is not in the schema', () => {
    const noBatchSchema = SAMPLE_SCHEMA.filter((c) => c.title !== 'Batch')
    expect(resolveBatchLabel(noBatchSchema, '2026-05', mockParse)).toBeNull()
  })
})
