/**
 * Smoke test for the author/dry-run path. No browser, no Anthropic key required.
 *
 * Exercises:
 * - AuthoringPlanSchema parses a representative plan
 * - dryRunPage emits a markdown preview file with manual overrides interleaved at the
 *   right positions (afterBlockIndex semantics)
 * - renderPlanMarkdown produces a stable plan summary for human review
 *
 * Run with: `npx tsx src/author/__smoke.ts`
 */

import { mkdir, readFile, rm } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PATHS } from '../config.js'
import type { AuthoringPlan } from '../translate/schemas.js'
import { AuthoringPlanSchema } from '../translate/schemas.js'
import { renderPlanMarkdown } from '../translate/translator.js'
import { dryRunPage } from './pageBuilder.js'

const samplePlan: AuthoringPlan = {
  title: 'How we brief',
  slug: 'how-we-brief',
  blocks: [
    { type: 'heading', level: 2, text: 'Step 1: define the angle' },
    { type: 'text', markdown: 'Start from customer voice.\n\n- Hook\n- Relevance\n- Trust' },
    {
      type: 'image',
      localPath: 'assets/how-we-brief/image-001.png',
      layout: 'inline',
      alt: 'Whiteboard sketch',
      caption: 'A sketch of the briefing pipeline.',
    },
    { type: 'divider' },
    { type: 'heading', level: 2, text: 'Step 2: pair with a hypothesis' },
    { type: 'text', markdown: 'Pair the visual with a one-line angle hypothesis.' },
    { type: 'callout', style: 'tip', markdown: 'Always ground the hypothesis in evidence.' },
  ],
  manualOverrides: [
    { afterBlockIndex: -1, reason: 'Hero banner — Gabriel selects background image and styling.' },
    { afterBlockIndex: 2, reason: 'Image styling — Gabriel decides full-bleed vs inline.' },
  ],
  warnings: ['Unmapped web part: cafefeed-cafe-cafe-cafe-cafefeedcafe in section section-2'],
}

let failures = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`)
  } else {
    failures += 1
    console.error(`  FAIL ${msg}`)
  }
}

async function main(): Promise<void> {
  console.log('AuthoringPlanSchema validation')
  const validated = AuthoringPlanSchema.safeParse(samplePlan)
  assert(validated.success, 'sample plan validates')

  console.log('\nrenderPlanMarkdown')
  const md = renderPlanMarkdown(samplePlan)
  assert(md.startsWith('# Authoring plan: How we brief\n'), 'markdown starts with plan title')
  assert(md.includes('## Warnings'), 'warnings section is rendered')
  assert(md.includes('## Manual override checkpoints'), 'manual overrides section is rendered')
  assert(md.includes('## Blocks'), 'blocks section is rendered')

  console.log('\ndryRunPage output')
  // Ensure output dir exists and the previous run is cleaned, so we test the fresh path.
  await mkdir(PATHS.output, { recursive: true })
  const target = resolve(PATHS.output, `${samplePlan.slug}.preview.md`)
  await rm(target, { force: true })

  const written = await dryRunPage(samplePlan)
  assert(written === target, `dryRunPage returns the expected file path (got ${written})`)

  const content = await readFile(written, 'utf8')
  assert(content.startsWith('# Dry-run preview: How we brief\n'), 'preview starts with header')

  // The pre-block override (afterBlockIndex: -1) must appear BEFORE the first heading.
  const heroOverridePos = content.indexOf('Hero banner')
  const firstHeadingPos = content.indexOf('Step 1: define the angle')
  assert(heroOverridePos > -1, 'pre-block override is rendered')
  assert(firstHeadingPos > -1, 'first heading is rendered')
  assert(heroOverridePos < firstHeadingPos, 'pre-block override appears before first block')

  // The override at afterBlockIndex: 2 must appear AFTER the image (block 2) and BEFORE the divider (block 3).
  const imageStyleOverridePos = content.indexOf('Image styling')
  const imagePos = content.indexOf('A sketch of the briefing pipeline.')
  const dividerPos = content.indexOf('---', imagePos)
  assert(imageStyleOverridePos > imagePos, 'image override appears after the image block')
  assert(imageStyleOverridePos < dividerPos, 'image override appears before the divider that follows')

  await rm(target, { force: true }).catch(() => undefined)

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`)
    process.exit(1)
  }
  console.log(`\nAll assertions passed`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
