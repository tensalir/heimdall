import { mkdir, readFile, readdir } from 'node:fs/promises'
import { resolve } from 'node:path'

import { PATHS, loadConfig } from '../config.js'
import type { AuthoringPlan } from '../translate/schemas.js'
import { AuthoringPlanSchema } from '../translate/schemas.js'
import { ensureSignedIn, openGoogleSession } from './googleAuth.js'
import { buildPage, dryRunPage } from './pageBuilder.js'
import { SitesEditor } from './sitesEditor.js'

export interface AuthorOptions {
  /** Slug or page title to author. */
  page?: string
  /** When true, emit a Markdown preview only — never touch Google Sites. */
  dryRun?: boolean
  /** When true, run the browser headless. Default: false on first run, true after. */
  headless?: boolean
}

export async function runAuthor(options: AuthorOptions = {}): Promise<void> {
  await mkdir(PATHS.output, { recursive: true })
  const plans = await loadPlans(options.page)
  if (plans.length === 0) {
    throw new Error(
      `No translated plans found in ${PATHS.output}. Run \`npm run translate\` first.`,
    )
  }

  if (options.dryRun) {
    for (const plan of plans) {
      const target = await dryRunPage(plan)
      console.log(`[author] dry-run preview: ${target}`)
    }
    return
  }

  const cfg = loadConfig('author')

  console.log(`[author] Opening Google Sites session…`)
  const session = await openGoogleSession({ headless: options.headless ?? false })
  try {
    await session.page.goto(cfg.GOOGLE_SITES_EDIT_URL!, { waitUntil: 'domcontentloaded' })
    await ensureSignedIn(session.page)

    for (const plan of plans) {
      console.log(`[author] -> ${plan.title}`)
      const editor = new SitesEditor(session.page, { slug: plan.slug })
      await editor.openSite(cfg.GOOGLE_SITES_EDIT_URL!)
      await editor.openOrCreatePage(plan.title)
      const result = await buildPage(editor, plan, { draftOnly: true })
      const failed = result.steps.filter((s) => !s.ok).length
      console.log(
        `[author]    ${result.steps.length} steps (${failed} failed). Draft saved; transaction.json written.`,
      )
    }
  } finally {
    await session.close()
  }
}

async function loadPlans(needle: string | undefined): Promise<AuthoringPlan[]> {
  const all = await readdir(PATHS.output).catch(() => [] as string[])
  const slugs = all.filter((f) => f.endsWith('.plan.json')).map((f) => f.replace(/\.plan\.json$/, ''))
  const target = needle?.toLowerCase().trim()

  const plans: AuthoringPlan[] = []
  for (const slug of slugs) {
    const raw = JSON.parse(await readFile(resolve(PATHS.output, `${slug}.plan.json`), 'utf8'))
    const parsed = AuthoringPlanSchema.safeParse(raw)
    if (!parsed.success) continue
    if (target && parsed.data.slug !== target && parsed.data.title.toLowerCase() !== target) continue
    plans.push(parsed.data)
  }
  return plans
}
