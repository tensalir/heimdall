import { describe, expect, it } from 'vitest'

import {
  coerceLegacyPageSummaries,
  matchLegacyBriefingPages,
  normalizeBriefingName,
} from './briefingLegacyPageMatcher.js'

describe('coerceLegacyPageSummaries', () => {
  it('keeps only well-formed page summaries', () => {
    const pages = coerceLegacyPageSummaries([
      { pageId: '12:34', pageName: 'EXP-123', contentStatus: 'populated' },
      { pageId: '', pageName: 'Missing id' },
      { pageId: '22:22', pageName: '', contentStatus: 'empty' },
      null,
    ])

    expect(pages).toEqual([
      { pageId: '12:34', pageName: 'EXP-123', contentStatus: 'populated' },
    ])
  })
})

describe('matchLegacyBriefingPages', () => {
  const items = [
    {
      mondayItemId: '100',
      mondayBoardId: 'board-1',
      mondayItemName: 'EXP-LM100.Switch-Angle-A',
      batchCanonical: '2026-03',
    },
    {
      mondayItemId: '200',
      mondayBoardId: 'board-1',
      mondayItemName: 'EXP-LM200.Switch-Angle-B',
      batchCanonical: '2026-03',
    },
  ]

  it('prefers explicit monday item plugin data when available', () => {
    const matches = matchLegacyBriefingPages(items, [
      {
        pageId: '1:1',
        pageName: 'Old Manual Name',
        mondayItemId: '200',
        contentStatus: 'populated',
      },
    ])

    expect(matches).toEqual([
      {
        item: items[1],
        page: {
          pageId: '1:1',
          pageName: 'Old Manual Name',
          mondayItemId: '200',
          contentStatus: 'populated',
        },
        matchType: 'plugin_data',
      },
    ])
  })

  it('matches populated legacy pages by exact normalized page name', () => {
    const matches = matchLegacyBriefingPages(items, [
      {
        pageId: '2:2',
        pageName: '  exp-lm100.switch-angle-a  ',
        contentStatus: 'populated',
      },
    ])

    expect(matches).toHaveLength(1)
    expect(matches[0]?.item.mondayItemId).toBe('100')
    expect(matches[0]?.page.pageId).toBe('2:2')
    expect(matches[0]?.matchType).toBe('page_name')
  })

  it('does not backfill empty pages', () => {
    const matches = matchLegacyBriefingPages(items, [
      {
        pageId: '3:3',
        pageName: 'EXP-LM100.Switch-Angle-A',
        contentStatus: 'empty',
      },
    ])

    expect(matches).toEqual([])
  })

  it('skips ambiguous page-name matches', () => {
    const duplicateItems = [
      ...items,
      {
        mondayItemId: '300',
        mondayBoardId: 'board-1',
        mondayItemName: 'EXP-LM100.Switch-Angle-A',
        batchCanonical: '2026-03',
      },
    ]

    const matches = matchLegacyBriefingPages(duplicateItems, [
      {
        pageId: '4:4',
        pageName: 'EXP-LM100.Switch-Angle-A',
        contentStatus: 'populated',
      },
    ])

    expect(matches).toEqual([])
  })
})

describe('normalizeBriefingName', () => {
  it('collapses whitespace and lowercases names', () => {
    expect(normalizeBriefingName('  EXP-LM100.  Switch  Angle A  ')).toBe(
      'exp-lm100. switch angle a'
    )
  })
})
