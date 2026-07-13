import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PATHS } from '../config.js'
import type { PageContent } from '../extract/types.js'
import type { AuthoringPlan } from './schemas.js'
import { renderPlanMarkdown, translatePage } from './translator.js'

export interface TranslateOptions {
  /** Slug or title of a single page to translate (matches pages/<slug>.json). */
  page?: string
}

export async function runTranslate(options: TranslateOptions = {}): Promise<{ plans: AuthoringPlan[] }> {
  await mkdir(PATHS.output, { recursive: true })

  const slugs = await chooseSlugs(options.page)
  if (slugs.length === 0) {
    throw new Error(`No pages found matching ${options.page ?? '(all)'} in ${PATHS.pages}. Run extract first.`)
  }

  const plans: AuthoringPlan[] = []
  for (const slug of slugs) {
    console.log(`[translate] -> ${slug}`)
    try {
      const page = JSON.parse(await readFile(resolve(PATHS.pages, `${slug}.json`), 'utf8')) as PageContent
      const plan = await translatePage(page)
      await writeFile(resolve(PATHS.output, `${slug}.plan.json`), JSON.stringify(plan, null, 2), 'utf8')
      await writeFile(resolve(PATHS.output, `${slug}.plan.md`), renderPlanMarkdown(plan), 'utf8')
      plans.push(plan)
      console.log(`[translate]    ${plan.blocks.length} blocks, ${plan.warnings.length} warnings, ${plan.manualOverrides.length} overrides`)
    } catch (err) {
      console.error(`[translate]    FAILED: ${(err as Error).message}`)
    }
  }

  console.log(`[translate] Done. ${plans.length}/${slugs.length} pages translated.`)
  return { plans }
}

async function chooseSlugs(needle: string | undefined): Promise<string[]> {
  const all = await readdir(PATHS.pages).catch(() => [] as string[])
  const slugs = all.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  if (!needle) return slugs

  const target = needle.toLowerCase().trim()
  const direct = slugs.find((s) => s === target)
  if (direct) return [direct]
  // also support passing the page title directly
  for (const slug of slugs) {
    try {
      const raw = JSON.parse(await readFile(resolve(PATHS.pages, `${slug}.json`), 'utf8')) as { title?: string }
      if (typeof raw.title === 'string' && raw.title.toLowerCase() === target) return [slug]
    } catch {
      // ignore parse errors here; treated as miss
    }
  }
  return []
}
