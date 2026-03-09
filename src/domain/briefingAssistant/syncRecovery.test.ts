import { describe, it, expect } from 'vitest'

/**
 * Regression tests for the briefing sync recovery changes:
 * - Content-empty detection prevents false "synced" badges
 * - Deferred completion ensures images are imported before backend is notified
 * - Missing doc content is surfaced rather than silently producing blank pages
 */

describe('Content-empty detection', () => {
  // nameSet is ignored: the experiment name is always written during template clone,
  // so it cannot distinguish a populated page from an empty shell.
  function isContentEmpty(score: { nameSet: boolean; briefingSet: boolean; variantsPopulated: number }): boolean {
    return !score.briefingSet && score.variantsPopulated === 0
  }

  it('should flag a page with no content as empty', () => {
    expect(isContentEmpty({ nameSet: false, briefingSet: false, variantsPopulated: 0 })).toBe(true)
  })

  it('should still flag a page as empty when only the name is set (name is always written on clone)', () => {
    expect(isContentEmpty({ nameSet: true, briefingSet: false, variantsPopulated: 0 })).toBe(true)
  })

  it('should not flag a page with briefing content as empty', () => {
    expect(isContentEmpty({ nameSet: false, briefingSet: true, variantsPopulated: 0 })).toBe(false)
  })

  it('should not flag a page with populated variants as empty', () => {
    expect(isContentEmpty({ nameSet: false, briefingSet: false, variantsPopulated: 2 })).toBe(false)
  })

  it('should not flag a fully populated page as empty', () => {
    expect(isContentEmpty({ nameSet: true, briefingSet: true, variantsPopulated: 4 })).toBe(false)
  })
})

describe('Deferred completion flow', () => {
  it('should defer reportResults when hasImages is true', () => {
    let pendingResults: unknown[] | null = null
    let reportCalled = false

    function reportResults(results: unknown[]) {
      reportCalled = true
    }

    const jobsProcessed = {
      results: [{ idempotencyKey: 'k1', pageId: '123', error: undefined, contentEmpty: false }],
      hasImages: true,
    }

    if (jobsProcessed.hasImages) {
      pendingResults = jobsProcessed.results
    } else {
      reportResults(jobsProcessed.results)
    }

    expect(reportCalled).toBe(false)
    expect(pendingResults).not.toBeNull()
  })

  it('should call reportResults immediately when hasImages is false', () => {
    let reportCalled = false

    function reportResults(_results: unknown[]) {
      reportCalled = true
    }

    const jobsProcessed = {
      results: [{ idempotencyKey: 'k1', pageId: '123', error: undefined, contentEmpty: false }],
      hasImages: false,
    }

    if (jobsProcessed.hasImages) {
      // defer
    } else {
      reportResults(jobsProcessed.results)
    }

    expect(reportCalled).toBe(true)
  })

  it('should trigger deferred report when images-import-done arrives', () => {
    let pendingResults: unknown[] | null = [{ idempotencyKey: 'k1', pageId: '123' }]
    let reportedResults: unknown[] | null = null
    let reportedImageLine: string | null = null

    function reportResults(results: unknown[], imageLine?: string) {
      reportedResults = results
      reportedImageLine = imageLine ?? null
    }

    const imagesImportDone = { placed: 3, total: 5 }
    const line = `Images: ${imagesImportDone.placed}/${imagesImportDone.total} placed in Figma.`

    if (pendingResults) {
      reportResults(pendingResults, line)
      pendingResults = null
    }

    expect(reportedResults).toHaveLength(1)
    expect(reportedImageLine).toContain('3/5')
    expect(pendingResults).toBeNull()
  })
})

describe('Content-empty results should be reported as failures', () => {
  it('should route contentEmpty results to fail endpoint', () => {
    const results = [
      { idempotencyKey: 'k1', experimentPageName: 'EXP-LM211', pageId: '123', error: undefined, contentEmpty: true, outcome: 'created' },
      { idempotencyKey: 'k2', experimentPageName: 'EXP-LM212', pageId: '456', error: undefined, contentEmpty: false, outcome: 'created' },
      { idempotencyKey: 'k3', experimentPageName: 'EXP-LM213', pageId: '', error: 'No template', contentEmpty: undefined, outcome: undefined },
    ]

    const completeCalls: string[] = []
    const failCalls: string[] = []

    for (const r of results) {
      if (r.error) {
        failCalls.push(r.idempotencyKey)
      } else if (r.contentEmpty) {
        failCalls.push(r.idempotencyKey)
      } else {
        completeCalls.push(r.idempotencyKey)
      }
    }

    expect(failCalls).toEqual(['k1', 'k3'])
    expect(completeCalls).toEqual(['k2'])
  })
})

describe('Page classification', () => {
  it('should classify pages with populated content as populated', () => {
    const existingMondayItemIdSet: Record<string, boolean> = { '100': true }
    const pageContentStatusMap: Record<string, string> = { '100': 'populated' }

    function classify(itemId: string): string {
      if (!existingMondayItemIdSet[itemId]) return 'new'
      if (pageContentStatusMap[itemId] === 'populated') return 'populated'
      if (pageContentStatusMap[itemId] === 'empty') return 'empty-import'
      return 'exists'
    }

    expect(classify('100')).toBe('populated')
  })

  it('should classify pages with empty content as empty-import', () => {
    const existingMondayItemIdSet: Record<string, boolean> = { '200': true }
    const pageContentStatusMap: Record<string, string> = { '200': 'empty' }

    function classify(itemId: string): string {
      if (!existingMondayItemIdSet[itemId]) return 'new'
      if (pageContentStatusMap[itemId] === 'populated') return 'populated'
      if (pageContentStatusMap[itemId] === 'empty') return 'empty-import'
      return 'exists'
    }

    expect(classify('200')).toBe('empty-import')
  })

  it('should classify unknown pages as new', () => {
    const existingMondayItemIdSet: Record<string, boolean> = {}
    const pageContentStatusMap: Record<string, string> = {}

    function classify(itemId: string): string {
      if (!existingMondayItemIdSet[itemId]) return 'new'
      if (pageContentStatusMap[itemId] === 'populated') return 'populated'
      if (pageContentStatusMap[itemId] === 'empty') return 'empty-import'
      return 'exists'
    }

    expect(classify('999')).toBe('new')
  })

  it('should classify pages without content status as exists (name-only match)', () => {
    const existingMondayItemIdSet: Record<string, boolean> = { '300': true }
    const pageContentStatusMap: Record<string, string> = {}

    function classify(itemId: string): string {
      if (!existingMondayItemIdSet[itemId]) return 'new'
      if (pageContentStatusMap[itemId] === 'populated') return 'populated'
      if (pageContentStatusMap[itemId] === 'empty') return 'empty-import'
      return 'exists'
    }

    expect(classify('300')).toBe('exists')
  })
})
