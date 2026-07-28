/**
 * The upload flow's decision logic.
 *
 * These helpers live inside the plugin's UI string (the iframe body cannot
 * import a module, so that string is the only copy). They are pure, so the test
 * lifts them out and runs them against the shape Babylon's
 * `condenseImportReport` actually returns.
 *
 * `publishPlan` is worth pinning: it decides whether Publish may create locale
 * pages from an uploaded workbook. Getting it wrong is not cosmetic —
 * `applyLocalePackage` resolves `source_page_id` with `getNodeByIdAsync`, and
 * Figma node ids are unique only within a file, so a pack from the wrong file
 * would find whichever page shares the id and overwrite it.
 *
 * The other half matters just as much in the other direction: a pack that
 * cannot be published must still be *saveable*, or having the wrong file open
 * silently throws away the agency's work.
 */
import { describe, expect, it } from 'vitest'
import { localizationUiHtml } from '../../packages/figma-plugin/src/commands/localization'

interface Plan {
  state: 'ready' | 'save-only' | 'blocked'
  reason?: string
  pages: Array<Record<string, unknown>>
  langs: string[]
  names: string[]
  file: string
}

interface Ctx {
  PROJECT: string | null
  TABS: Array<{ id: string; name: string }>
  RUN_IDS: string[]
  SHEET_SOURCE: string
  saved: string[]
  publishPlan(report: unknown): Plan
  adoptPlan(plan: Plan): boolean
  publishLabel(plan: Plan): string
}

/** Run the helpers with the module-level vars they close over turned into
 *  locals, so each test gets an isolated document state. */
function load(fileKey: string): Ctx {
  const source = (name: string) => {
    const start = localizationUiHtml.indexOf(`function ${name}(`)
    if (start < 0) throw new Error(`${name} not found in the plugin UI — did it get renamed?`)
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
    ${source('uniq')}
    ${source('publishPlan')}
    ${source('adoptPlan')}
    ${source('publishLabel')}
    return {
      publishPlan: publishPlan, adoptPlan: adoptPlan, publishLabel: publishLabel,
      get PROJECT() { return PROJECT }, get TABS() { return TABS },
      get RUN_IDS() { return RUN_IDS }, get SHEET_SOURCE() { return SHEET_SOURCE },
      get saved() { return saved }
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

describe('publishPlan', () => {
  it('is ready when the pack belongs to the open file', () => {
    const plan = load(OPEN_FILE).publishPlan(report())
    expect(plan.state).toBe('ready')
    expect(plan.reason).toBeUndefined()
    expect(plan.names).toEqual(['PDP · EN'])
    expect(plan.langs).toEqual(['NL', 'DE'])
  })

  it('is save-only — never blocked — for a pack from a different file', () => {
    const plan = load(OPEN_FILE).publishPlan(report({ file_key: 'other', file_name: 'Other File' }))
    expect(plan.state).toBe('save-only')
    expect(plan.reason).toContain('Other File')
  })

  it('is save-only when the pack spans several files', () => {
    const plan = load(OPEN_FILE).publishPlan(report({ file_key: null }))
    expect(plan.state).toBe('save-only')
    expect(plan.reason).toContain('more than one Figma file')
  })

  it('is save-only when this document has no link to check against', () => {
    const plan = load('').publishPlan(report())
    expect(plan.state).toBe('save-only')
    expect(plan.reason).toContain('link is missing')
  })

  it('blocks only when nothing could be tied to a page', () => {
    const plan = load(OPEN_FILE).publishPlan(report({ pages: [], file_key: null }))
    expect(plan.state).toBe('blocked')
    expect(plan.reason).toContain('tied back to a page')
  })

  it('tolerates a report with no figma block at all', () => {
    expect(load(OPEN_FILE).publishPlan({}).state).toBe('blocked')
  })

  it('leaves the display name empty rather than showing the raw file key', () => {
    // Babylon returns file_name: null when it never learned one. Printing the
    // key beside the page name reads as noise.
    const plan = load(OPEN_FILE).publishPlan(report({ file_name: null }))
    expect(plan.state).toBe('ready')
    expect(plan.file).toBe('')
  })

  it('still names the wrong file by key when there is no file name', () => {
    const plan = load(OPEN_FILE).publishPlan(report({ file_key: 'zzz999', file_name: null }))
    expect(plan.state).toBe('save-only')
    expect(plan.reason).toContain('zzz999')
  })

  it('de-duplicates languages across pages and upper-cases them', () => {
    const pages = [
      { project_id: 'p', run_id: 'r1', page_node_id: '1:1', page_name: 'A', target_languages: ['nl', 'de'] },
      { project_id: 'p', run_id: 'r2', page_node_id: '1:2', page_name: 'B', target_languages: ['de', 'fr'] },
    ]
    expect(load(OPEN_FILE).publishPlan(report({ pages })).langs).toEqual(['NL', 'DE', 'FR'])
  })
})

describe('adoptPlan', () => {
  it('takes project, tabs and runs from the workbook and persists them', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.adoptPlan(ctx.publishPlan(report()))).toBe(true)
    expect(ctx.PROJECT).toBe('proj-1')
    expect(ctx.RUN_IDS).toEqual(['run-1'])
    expect(ctx.TABS).toEqual([{ id: '10:2', name: 'PDP · EN' }])
    expect(ctx.SHEET_SOURCE).toBe('imported')
    expect(ctx.saved).toHaveLength(1)
  })

  it('refuses anything not ready and leaves state untouched', () => {
    for (const over of [{ file_key: 'other' }, { file_key: null }, { pages: [], file_key: null }]) {
      const ctx = load(OPEN_FILE)
      expect(ctx.adoptPlan(ctx.publishPlan(report(over)))).toBe(false)
      expect(ctx.RUN_IDS).toEqual([])
      expect(ctx.PROJECT).toBeNull()
      expect(ctx.saved).toHaveLength(0)
    }
  })

  it('de-duplicates run ids across sheets that share a run', () => {
    const ctx = load(OPEN_FILE)
    const pages = [
      { project_id: 'proj-1', run_id: 'run-1', page_node_id: '10:2', page_name: 'A', target_languages: ['nl'] },
      { project_id: 'proj-1', run_id: 'run-1', page_node_id: '10:2', page_name: 'A', target_languages: ['nl'] },
      { project_id: 'proj-1', run_id: 'run-2', page_node_id: '10:9', page_name: 'B', target_languages: ['nl'] },
    ]
    ctx.adoptPlan(ctx.publishPlan(report({ pages })))
    expect(ctx.RUN_IDS).toEqual(['run-1', 'run-2'])
  })
})

describe('publishLabel', () => {
  it('states the page count and languages so the button says what it will do', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.publishLabel(ctx.publishPlan(report()))).toBe('Publish 1 page to Figma (NL, DE)')
  })

  it('pluralises', () => {
    const ctx = load(OPEN_FILE)
    const pages = [
      { project_id: 'p', run_id: 'r1', page_node_id: '1:1', page_name: 'A', target_languages: ['nl'] },
      { project_id: 'p', run_id: 'r2', page_node_id: '1:2', page_name: 'B', target_languages: ['nl'] },
    ]
    expect(ctx.publishLabel(ctx.publishPlan(report({ pages })))).toBe('Publish 2 pages to Figma (NL)')
  })

  it('offers to save rather than publish when the pages cannot be made here', () => {
    const ctx = load(OPEN_FILE)
    expect(ctx.publishLabel(ctx.publishPlan(report({ file_key: 'other' })))).toBe('Save translations')
  })
})
