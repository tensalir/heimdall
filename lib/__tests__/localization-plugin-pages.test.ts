/**
 * Locale-page collision handling: finding the page a run already owns, and
 * naming copies when the user chooses to keep both.
 *
 * The subtle part is `copyOf`. Copies made by "Keep both" carry the same
 * locale/runId tags — they are locale pages and a human should read them as
 * such — so without the marker the next publish would update whichever copy
 * happened to sit first in the page order instead of the original.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import {
  existingLocalePages,
  findLocalePage,
  nextCopyName,
  suffixFor,
} from '../../packages/figma-plugin/src/commands/localization'

interface FakePage {
  id: string
  name: string
  data: Record<string, string>
  getSharedPluginData(ns: string, key: string): string
}

function page(id: string, name: string, data: Record<string, string> = {}): FakePage {
  return {
    id,
    name,
    data,
    getSharedPluginData(_ns: string, key: string) {
      return data[key] ?? ''
    },
  }
}

function setPages(pages: FakePage[]) {
  ;(globalThis as unknown as { figma: unknown }).figma = { root: { children: pages } }
}

beforeEach(() => setPages([]))

describe('suffixFor', () => {
  it('runs _A through _Z then carries into _AA', () => {
    expect(suffixFor(0)).toBe('_A')
    expect(suffixFor(1)).toBe('_B')
    expect(suffixFor(25)).toBe('_Z')
    expect(suffixFor(26)).toBe('_AA')
    expect(suffixFor(27)).toBe('_AB')
    expect(suffixFor(51)).toBe('_AZ')
    expect(suffixFor(52)).toBe('_BA')
  })

  it('never repeats a suffix', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 200; i++) seen.add(suffixFor(i))
    expect(seen.size).toBe(200)
  })
})

describe('nextCopyName', () => {
  it('starts at _A', () => {
    setPages([page('1', 'Page 1 (ES-419)')])
    expect(nextCopyName('Page 1 (ES-419)')).toBe('Page 1 (ES-419)_A')
  })

  it('skips suffixes already taken, whatever created them', () => {
    setPages([
      page('1', 'Page 1 (ES-419)'),
      page('2', 'Page 1 (ES-419)_A'),
      page('3', 'Page 1 (ES-419)_B'),
    ])
    expect(nextCopyName('Page 1 (ES-419)')).toBe('Page 1 (ES-419)_C')
  })

  it('fills a gap left by a deleted copy rather than always growing', () => {
    setPages([page('1', 'Page 1 (ES-419)'), page('2', 'Page 1 (ES-419)_B')])
    expect(nextCopyName('Page 1 (ES-419)')).toBe('Page 1 (ES-419)_A')
  })

  it('does not collide with an unrelated page that shares the prefix', () => {
    setPages([page('1', 'Page 1 (ES-419)_A'), page('2', 'Page 10 (ES-419)')])
    expect(nextCopyName('Page 1 (ES-419)')).toBe('Page 1 (ES-419)_B')
  })
})

describe('findLocalePage', () => {
  it('finds the page tagged with this run and locale', () => {
    setPages([
      page('1', 'EN'),
      page('2', 'Page 1 (ES-419)', { locale: 'ES-419', runId: 'run-1' }),
    ])
    expect(findLocalePage('run-1', 'ES-419')?.name).toBe('Page 1 (ES-419)')
  })

  it('ignores a page for a different run or a different locale', () => {
    setPages([
      page('2', 'other run', { locale: 'ES-419', runId: 'run-2' }),
      page('3', 'other locale', { locale: 'NL', runId: 'run-1' }),
    ])
    expect(findLocalePage('run-1', 'ES-419')).toBeNull()
  })

  it('skips copies, so the original stays the one that gets updated', () => {
    setPages([
      // The copy sits FIRST in page order — the case that would silently pick
      // the wrong page without the copyOf marker.
      page('9', 'Page 1 (ES-419)_A', { locale: 'ES-419', runId: 'run-1', copyOf: '2' }),
      page('2', 'Page 1 (ES-419)', { locale: 'ES-419', runId: 'run-1' }),
    ])
    expect(findLocalePage('run-1', 'ES-419')?.id).toBe('2')
  })

  it('returns null when only copies remain', () => {
    setPages([page('9', 'Page 1 (ES-419)_A', { locale: 'ES-419', runId: 'run-1', copyOf: '2' })])
    expect(findLocalePage('run-1', 'ES-419')).toBeNull()
  })
})

describe('existingLocalePages', () => {
  it('reports only the locales that already have a page', () => {
    setPages([
      page('2', 'Page 1 (ES-419)', { locale: 'ES-419', runId: 'run-1' }),
      page('3', 'Page 1 (NL)', { locale: 'NL', runId: 'run-1' }),
    ])
    const found = existingLocalePages([{ runId: 'run-1', locales: ['es-419', 'nl', 'de'] }])
    expect(found).toEqual([
      { runId: 'run-1', locale: 'ES-419', name: 'Page 1 (ES-419)' },
      { runId: 'run-1', locale: 'NL', name: 'Page 1 (NL)' },
    ])
  })

  it('upper-cases the locale before matching, since the pack sends lower case', () => {
    setPages([page('2', 'Page 1 (NL)', { locale: 'NL', runId: 'run-1' })])
    expect(existingLocalePages([{ runId: 'run-1', locales: ['nl'] }])).toHaveLength(1)
  })

  it('is empty when nothing has been published yet', () => {
    setPages([page('1', 'EN')])
    expect(existingLocalePages([{ runId: 'run-1', locales: ['nl'] }])).toEqual([])
  })

  it('tolerates a run with no locales', () => {
    expect(existingLocalePages([{ runId: 'run-1', locales: [] }])).toEqual([])
  })
})
