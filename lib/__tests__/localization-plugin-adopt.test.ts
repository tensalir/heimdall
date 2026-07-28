/**
 * The Localization tab's step-4 decision logic.
 *
 * These two helpers live inside the plugin's UI string (the iframe body cannot
 * import a module, so that string is the only copy). They are pure, so the test
 * lifts them out and runs them against the shape Babylon's
 * `condenseImportReport` actually returns.
 *
 * `adoptImportedSheet` is worth pinning: it decides whether step 5 may push the
 * runs from an uploaded workbook. Getting it wrong is not a cosmetic bug —
 * `applyLocalePackage` resolves `source_page_id` with `getNodeByIdAsync`, and
 * Figma node ids are unique only within a file, so a pack from the wrong file
 * would find whichever page shares the id and overwrite it.
 */
import { describe, expect, it } from 'vitest'
import { localizationUiHtml } from '../../packages/figma-plugin/src/commands/localization'

interface Ctx {
  FILE_KEY: string
  PROJECT: string | null
  TABS: Array<{ id: string; name: string }>
  RUN_IDS: string[]
  SHEET_SOURCE: string
  RESUMED_AT: string
  saved: string[]
  adoptImportedSheet(report: unknown): string
  describeTarget(report: unknown): string
}

/**
 * Evaluate the two helpers with the module-level vars they close over turned
 * into locals, so each test gets an isolated document state.
 */
function load(fileKey: string): Ctx {
  const source = (name: string) => {
    const start = localizationUiHtml.indexOf(`function ${name}(`)
    if (start < 0) throw new Error(`${name} not found in the plugin UI — did it get renamed?`)
    // Both helpers end at the first line that is exactly "}" at column 0.
    const end = localizationUiHtml.indexOf('\n}', start)
    if (end < 0) throw new Error(`Could not find the end of ${name}`)
    return localizationUiHtml.slice(start, end + 2)
  }

  const factory = new Function(
    'FILE_KEY',
    `
    var PROJECT = null, TABS = [], RUN_IDS = [], SHEET_SOURCE = 'extracted', RESUMED_AT = '';
    var saved = [];
    function persistState() { saved.push(JSON.stringify({ PROJECT: PROJECT, RUN_IDS: RUN_IDS, SHEET_SOURCE: SHEET_SOURCE })); }
    ${source('describeTarget')}
    ${source('adoptImportedSheet')}
    return {
      adoptImportedSheet: adoptImportedSheet,
      describeTarget: describeTarget,
      get PROJECT() { return PROJECT }, get TABS() { return TABS },
      get RUN_IDS() { return RUN_IDS }, get SHEET_SOURCE() { return SHEET_SOURCE },
      get RESUMED_AT() { return RESUMED_AT }, get saved() { return saved },
      FILE_KEY: FILE_KEY
    };
  `,
  ) as (fileKey: string) => Ctx

  return factory(fileKey)
}

const OPEN_FILE = 'abc123'

function report(over: Record<string, unknown> = {}) {
  return {
    figma: {
      file_key: OPEN_FILE,
      file_name: 'Amazon Bundles',
      pages: [
        {
          sheet_name: 'Page 2',
          project_id: 'proj-1',
          run_id: 'run-1',
          file_key: OPEN_FILE,
          page_node_id: '10:2',
          page_name: 'PDP · EN',
          target_languages: ['nl', 'de'],
        },
      ],
      ...over,
    },
  }
}

describe('adoptImportedSheet', () => {
  it('adopts the runs from the workbook when it belongs to the open file', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptImportedSheet(report())).toBe('')
    expect(ctx.PROJECT).toBe('proj-1')
    expect(ctx.RUN_IDS).toEqual(['run-1'])
    expect(ctx.TABS).toEqual([{ id: '10:2', name: 'PDP · EN' }])
    expect(ctx.SHEET_SOURCE).toBe('imported')
    // Persisted, so reopening the plugin keeps step 5 reachable.
    expect(ctx.saved).toHaveLength(1)
  })

  it('refuses a pack from a different Figma file and leaves state untouched', () => {
    const ctx = load(OPEN_FILE)
    const reason = ctx.adoptImportedSheet(report({ file_key: 'other', pages: report().figma.pages }))
    expect(reason).toContain('different Figma file')
    expect(ctx.RUN_IDS).toEqual([])
    expect(ctx.PROJECT).toBeNull()
    expect(ctx.saved).toHaveLength(0)
  })

  it('says the translations are still saved when it refuses — only the push is blocked', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptImportedSheet(report({ file_key: 'other' }))).toMatch(/translations are saved/i)
  })

  it('refuses a pack spanning several files (file_key null)', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptImportedSheet(report({ file_key: null }))).toContain('more than one Figma file')
    expect(ctx.RUN_IDS).toEqual([])
  })

  it('refuses when this document has no file key to compare against', () => {
    const ctx = load('')
    expect(ctx.adoptImportedSheet(report())).toContain('URL')
    expect(ctx.RUN_IDS).toEqual([])
  })

  it('reports nothing to push when no sheet resolved to a page', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptImportedSheet(report({ pages: [], file_key: null }))).toContain('nothing to push')
  })

  it('de-duplicates run ids across sheets that share a run', () => {
    const ctx = load(OPEN_FILE)
    const pages = [
      { project_id: 'proj-1', run_id: 'run-1', page_node_id: '10:2', page_name: 'A' },
      { project_id: 'proj-1', run_id: 'run-1', page_node_id: '10:2', page_name: 'A' },
      { project_id: 'proj-1', run_id: 'run-2', page_node_id: '10:9', page_name: 'B' },
    ]
    expect(ctx.adoptImportedSheet(report({ pages }))).toBe('')
    expect(ctx.RUN_IDS).toEqual(['run-1', 'run-2'])
  })

  it('tolerates a report with no figma block at all', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptImportedSheet({})).toContain('nothing to push')
  })
})

describe('describeTarget', () => {
  it('names the file and pages, and confirms it is the open document', () => {
    const ctx = load(OPEN_FILE)
    const t = ctx.describeTarget(report())
    expect(t).toContain('Amazon Bundles')
    expect(t).toContain('PDP · EN')
    expect(t).toContain('this document')
  })

  it('calls out a foreign file before anything is committed', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.describeTarget(report({ file_key: 'other' }))).toContain('NOT the document you have open')
  })

  it('does not claim a mismatch when this document has no file key', () => {
    const ctx = load('')
    const t = ctx.describeTarget(report())
    expect(t).not.toContain('NOT the document')
    expect(t).toContain('Amazon Bundles')
  })

  it('reports an unresolvable workbook plainly', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.describeTarget(report({ pages: [], file_key: null }))).toContain('Could not tie')
  })
})
