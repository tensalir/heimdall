import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PATHS } from '../config.js'
import type { AuthoringPlan, ManualOverride, PlanBlock } from '../translate/schemas.js'
import { SitesEditor, toAbsoluteAssetPath } from './sitesEditor.js'

export interface BuildOptions {
  /** When true, the page is left as a draft and Publish is never clicked. Default true. */
  draftOnly?: boolean
}

export interface StepLogEntry {
  step: number
  kind: string
  detail: string
  screenshot?: string
  ok: boolean
  error?: string
}

export interface BuildResult {
  slug: string
  steps: StepLogEntry[]
  warnings: string[]
}

/**
 * Walk an AuthoringPlan and execute it against the editor. Manual-override checkpoints
 * become inline `[MANUAL: ...]` placeholders so Gabriel can find them in the draft.
 *
 * Every step is logged to output/<slug>/transaction.json. Failures don't abort the run;
 * they're recorded and the next block is attempted, so a partial draft is still useful.
 */
export async function buildPage(
  editor: SitesEditor,
  plan: AuthoringPlan,
  _options: BuildOptions = {},
): Promise<BuildResult> {
  await editor.init()

  const steps: StepLogEntry[] = []

  // Pre-block manual override (afterBlockIndex === -1) goes first.
  for (const o of overridesAt(plan.manualOverrides, -1)) {
    await runStep(steps, 'manual-override', o.reason, () => editor.insertManualPlaceholder(o.reason))
  }

  for (let i = 0; i < plan.blocks.length; i += 1) {
    const block = plan.blocks[i]!
    await runStep(steps, block.type, describeBlockShort(block), () => insertBlock(editor, block))

    // Manual overrides registered to fire after this block.
    for (const o of overridesAt(plan.manualOverrides, i)) {
      await runStep(steps, 'manual-override', o.reason, () => editor.insertManualPlaceholder(o.reason))
    }
  }

  await runStep(steps, 'save', 'autosave wait', () => editor.save())

  const transaction = {
    slug: plan.slug,
    title: plan.title,
    blockCount: plan.blocks.length,
    overrideCount: plan.manualOverrides.length,
    warnings: plan.warnings,
    steps,
  }
  await writeFile(
    resolve(PATHS.output, plan.slug, 'transaction.json'),
    JSON.stringify(transaction, null, 2),
    'utf8',
  )

  return { slug: plan.slug, steps, warnings: plan.warnings }
}

/**
 * Dry-run: emit a Markdown file that shows exactly what would be authored, including
 * `[MANUAL: ...]` placeholders interleaved at the right block indices. No browser.
 */
export async function dryRunPage(plan: AuthoringPlan): Promise<string> {
  const lines: string[] = []
  lines.push(`# Dry-run preview: ${plan.title}`)
  lines.push('')
  lines.push(`Slug: \`${plan.slug}\``)
  if (plan.warnings.length > 0) {
    lines.push('')
    lines.push('## Warnings')
    for (const w of plan.warnings) lines.push(`- ${w}`)
  }
  lines.push('')

  for (const o of overridesAt(plan.manualOverrides, -1)) {
    lines.push(`> [MANUAL: ${o.reason}]`)
    lines.push('')
  }

  for (let i = 0; i < plan.blocks.length; i += 1) {
    lines.push(...renderBlock(plan.blocks[i]!))
    lines.push('')
    for (const o of overridesAt(plan.manualOverrides, i)) {
      lines.push(`> [MANUAL: ${o.reason}]`)
      lines.push('')
    }
  }

  const out = `${lines.join('\n').trimEnd()}\n`
  const target = resolve(PATHS.output, `${plan.slug}.preview.md`)
  await writeFile(target, out, 'utf8')
  return target
}

// -----------------------------------------------------------------------------
// internals
// -----------------------------------------------------------------------------

async function runStep(
  log: StepLogEntry[],
  kind: string,
  detail: string,
  action: () => Promise<void>,
): Promise<void> {
  const step = log.length + 1
  try {
    await action()
    log.push({ step, kind, detail, ok: true })
  } catch (err) {
    log.push({ step, kind, detail, ok: false, error: (err as Error).message })
    console.error(`[author] step ${step} (${kind}: ${detail}) FAILED — ${(err as Error).message}`)
  }
}

async function insertBlock(editor: SitesEditor, block: PlanBlock): Promise<void> {
  switch (block.type) {
    case 'heading':
      await editor.insertHeading(block.text, block.level)
      return
    case 'text':
      await editor.insertTextBlock(block.markdown)
      return
    case 'image':
      await editor.insertImage(toAbsoluteAssetPath(block.localPath), block.layout)
      return
    case 'divider':
      await editor.insertDivider()
      return
    case 'embed':
      await editor.insertEmbed(block.url)
      return
    case 'callout':
      // Sites doesn't have first-class callouts; render as a quoted text block with the
      // style prefix. Gabriel will style it during the manual pass.
      await editor.insertTextBlock(`> [${block.style.toUpperCase()}] ${block.markdown}`)
      return
    case 'twoColumn':
      // Sites' two-column layouts can't be created cleanly via keyboard alone. We render
      // the columns sequentially with a divider in between and surface a manual-override
      // placeholder so Gabriel can re-arrange.
      await editor.insertManualPlaceholder('Two-column section — re-arrange columns by hand.')
      for (const child of block.left) await insertBlock(editor, child)
      await editor.insertDivider()
      for (const child of block.right) await insertBlock(editor, child)
      return
  }
}

function describeBlockShort(block: PlanBlock): string {
  switch (block.type) {
    case 'heading':
      return `H${block.level}: ${block.text}`
    case 'text':
      return `text(${block.markdown.length}c)`
    case 'image':
      return `image: ${block.localPath}`
    case 'divider':
      return 'divider'
    case 'embed':
      return `embed: ${block.url}`
    case 'callout':
      return `callout(${block.style})`
    case 'twoColumn':
      return `twoColumn(${block.left.length}+${block.right.length})`
  }
}

function renderBlock(block: PlanBlock): string[] {
  switch (block.type) {
    case 'heading':
      return [`${'#'.repeat(block.level)} ${block.text}`]
    case 'text':
      return [block.markdown]
    case 'image':
      return [`![${block.alt}](${block.localPath})`, block.caption ? `_${block.caption}_` : '']
    case 'divider':
      return ['---']
    case 'embed':
      return [`> Embed (${block.provider}): <${block.url}>`]
    case 'callout':
      return [`> [${block.style.toUpperCase()}] ${block.markdown}`]
    case 'twoColumn': {
      const out: string[] = ['<!-- two-column -->', '<!-- left -->']
      for (const c of block.left) out.push(...renderBlock(c))
      out.push('<!-- right -->')
      for (const c of block.right) out.push(...renderBlock(c))
      return out
    }
  }
}

function overridesAt(overrides: ManualOverride[], idx: number): ManualOverride[] {
  return overrides.filter((o) => o.afterBlockIndex === idx)
}
