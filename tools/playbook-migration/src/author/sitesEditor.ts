import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Page } from 'playwright'

import { PATHS, TOOL_ROOT } from '../config.js'

/**
 * SitesEditor: every Google Sites editor interaction lives here.
 *
 * Why: New Google Sites has no stable `data-*` attributes. Selectors break with
 * every Google UI release. By quarantining all selectors in this one file,
 * fixing breakage means editing constants in this header — not hunting through
 * pageBuilder logic.
 *
 * Strategy (in order of preference):
 *   1. Role + accessible name (`getByRole('button', { name: 'Insert' })`)
 *   2. Visible text labels via `getByLabel` / `getByText`
 *   3. Keyboard shortcuts (`Ctrl+Enter`, `/`, etc.) — most stable across UI changes
 *   4. CSS selectors as last resort, all defined in SELECTORS below
 *
 * On first run against a live Site, selectors must be verified. Where Google's
 * concrete labels are unknown at code time, the most-likely candidate is used and
 * a TODO comment marks it for verification.
 */

/** TODO(verify on first author run): confirm/replace these labels against the live Sites editor. */
const SELECTORS = {
  insertButton: { role: 'button', name: /^insert$/i },
  insertMenuTextBox: { name: /^text box$/i },
  insertMenuImage: { name: /^image$/i },
  insertMenuImageUpload: { name: /^upload$/i },
  insertMenuEmbed: { name: /^embed$/i },
  insertMenuDivider: { name: /^divider$/i },
  publishButton: { role: 'button', name: /^publish$/i },
  // Heading style picker inside the floating text toolbar.
  textStylePicker: { role: 'button', name: /(normal text|heading|title|subheading)/i },
  textStyleHeading1Option: { name: /^heading 1$/i },
  textStyleHeading2Option: { name: /^heading 2$/i },
  textStyleHeading3Option: { name: /^heading 3$/i },
  textStyleNormalOption: { name: /^normal text$/i },
  /** Editor canvas root. Filled in lazily by waitForEditor() once Sites is loaded. */
  editorCanvas: '[role="main"]',
} as const

export interface SitesEditorOptions {
  /** Slug used to namespace screenshots into output/<slug>/. */
  slug: string
}

export class SitesEditor {
  private stepIndex = 0
  private screenshotsDir: string

  constructor(
    private readonly page: Page,
    private readonly opts: SitesEditorOptions,
  ) {
    this.screenshotsDir = resolve(PATHS.output, opts.slug)
  }

  async init(): Promise<void> {
    await mkdir(this.screenshotsDir, { recursive: true })
  }

  // ---------------------------------------------------------------------------
  // navigation
  // ---------------------------------------------------------------------------

  async openSite(url: string): Promise<void> {
    await this.page.goto(url, { waitUntil: 'domcontentloaded' })
    await this.waitForEditor()
    await this.screenshot('site-loaded')
  }

  /**
   * Wait until the Sites editor canvas is visible. This is the closest thing to
   * a "ready" signal we have without explicit Sites APIs.
   */
  async waitForEditor(): Promise<void> {
    await this.page.waitForSelector(SELECTORS.editorCanvas, { state: 'visible', timeout: 30_000 })
    // Sites also takes a beat to attach its keyboard handlers after first render.
    await this.page.waitForTimeout(750)
  }

  /**
   * Create a new subpage (or open an existing one with the same name) and focus
   * its body so subsequent insertions land there.
   *
   * NOTE: This calls into the "Pages" panel which is identified by an icon-only
   * button. The TODO in SELECTORS applies here; verify the accessible name on
   * first run.
   */
  async openOrCreatePage(title: string): Promise<void> {
    // 1. Open the Pages panel.
    await this.page.getByRole('button', { name: /^pages$/i }).click().catch(async () => {
      // Fallback: click the icon-only Pages tab on the right rail.
      await this.page.locator('[aria-label="Pages"]').first().click()
    })

    // 2. If a page with this title already exists, click it.
    const existing = this.page.getByRole('treeitem', { name: title }).first()
    if (await existing.isVisible().catch(() => false)) {
      await existing.click()
      await this.waitForEditor()
      await this.screenshot(`page-opened-${this.safeLabel(title)}`)
      return
    }

    // 3. Otherwise, create it. The "+" button at the bottom of the Pages panel.
    await this.page.getByRole('button', { name: /^new page$/i }).click()
    await this.page.getByRole('textbox', { name: /^name$/i }).fill(title)
    await this.page.getByRole('button', { name: /^done$/i }).click()
    await this.waitForEditor()
    await this.screenshot(`page-created-${this.safeLabel(title)}`)
  }

  // ---------------------------------------------------------------------------
  // block insertion
  // ---------------------------------------------------------------------------

  async insertHeading(text: string, level: 2 | 3): Promise<void> {
    await this.openInsertMenu()
    await this.page.getByRole('menuitem', SELECTORS.insertMenuTextBox).click()
    await this.waitForFloatingToolbar()
    await this.page.keyboard.type(text)
    // Select the inserted text, then change style.
    await this.page.keyboard.press('Control+A')
    await this.applyHeadingStyle(level)
    await this.dismissFloatingToolbar()
    await this.screenshot(`heading-h${level}-${this.safeLabel(text)}`)
  }

  async insertTextBlock(markdown: string): Promise<void> {
    await this.openInsertMenu()
    await this.page.getByRole('menuitem', SELECTORS.insertMenuTextBox).click()
    await this.waitForFloatingToolbar()
    // Paste line-by-line so list bullets and basic formatting via keyboard shortcuts work.
    // (Sites accepts a paste of plain text; rich-paste happens through Cmd+Shift+V.)
    const lines = markdown.split(/\r?\n/)
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i]!
      const wasList = /^\s*[-*]\s+/.test(line)
      const cleaned = wasList ? line.replace(/^\s*[-*]\s+/, '') : line
      if (wasList) await this.page.keyboard.type('- ')
      await this.page.keyboard.type(cleaned)
      if (i < lines.length - 1) await this.page.keyboard.press('Enter')
    }
    await this.dismissFloatingToolbar()
    await this.screenshot(`text-${this.stepIndex}`)
  }

  async insertImage(absolutePath: string, _layout: 'full' | 'inline'): Promise<void> {
    await this.openInsertMenu()
    await this.page.getByRole('menuitem', SELECTORS.insertMenuImage).click()

    // The Image picker is a sub-panel; pick "Upload" then provide the file path.
    await this.page.getByRole('tab', SELECTORS.insertMenuImageUpload).click().catch(() => {
      // Some variants of the picker use a button instead of a tab; retry.
      return this.page.getByRole('button', SELECTORS.insertMenuImageUpload).click()
    })

    const fileChooserPromise = this.page.waitForEvent('filechooser')
    await this.page.getByRole('button', { name: /(select|open|upload)/i }).click()
    const fileChooser = await fileChooserPromise
    await fileChooser.setFiles(absolutePath)

    // Wait for the image to register in the editor.
    await this.page.waitForTimeout(2000)
    // Layout: full-width vs inline. Sites exposes a width slider; we leave it at default
    // and let Gabriel resize during his manual pass. Recording a TODO for now.
    await this.screenshot(`image-${this.stepIndex}`)
  }

  async insertDivider(): Promise<void> {
    await this.openInsertMenu()
    await this.page.getByRole('menuitem', SELECTORS.insertMenuDivider).click()
    await this.screenshot(`divider-${this.stepIndex}`)
  }

  async insertEmbed(url: string): Promise<void> {
    await this.openInsertMenu()
    await this.page.getByRole('menuitem', SELECTORS.insertMenuEmbed).click()
    // Embed picker: "By URL" tab + URL input + Insert button.
    await this.page.getByRole('tab', { name: /by url/i }).click().catch(() => undefined)
    await this.page.getByRole('textbox').first().fill(url)
    await this.page.getByRole('button', { name: /^add$/i }).click()
    await this.page.getByRole('button', { name: /^insert$/i }).click()
    await this.screenshot(`embed-${this.stepIndex}`)
  }

  /**
   * Insert a visible "manual override" placeholder text block, so Gabriel can find every
   * checkpoint in the draft and replace it with the real banner / hero / colored callout.
   */
  async insertManualPlaceholder(reason: string): Promise<void> {
    await this.insertTextBlock(`> [MANUAL: ${reason}]`)
    await this.screenshot(`manual-${this.safeLabel(reason)}`)
  }

  // ---------------------------------------------------------------------------
  // save / publish
  // ---------------------------------------------------------------------------

  /**
   * Sites saves drafts automatically. Calling save() forces a brief idle wait so
   * autosave catches up before we move on. We **do not** click Publish from the
   * automation — Gabriel publishes only after his manual-override pass.
   */
  async save(): Promise<void> {
    await this.page.waitForTimeout(2000)
    await this.screenshot('saved-draft')
  }

  async screenshot(label: string): Promise<string> {
    this.stepIndex += 1
    const filename = `step-${String(this.stepIndex).padStart(3, '0')}-${this.safeLabel(label)}.png`
    const target = resolve(this.screenshotsDir, filename)
    await this.page.screenshot({ path: target, fullPage: false })
    return target
  }

  // ---------------------------------------------------------------------------
  // private helpers
  // ---------------------------------------------------------------------------

  private async openInsertMenu(): Promise<void> {
    // The Insert button on the right rail. There's also a `+` floating button after a block;
    // either path leads to the same insert panel.
    await this.page.getByRole('button', SELECTORS.insertButton).first().click()
    // Wait for the menu to actually expand.
    await this.page.waitForTimeout(300)
  }

  private async waitForFloatingToolbar(): Promise<void> {
    // The text formatting toolbar appears as a popover above the active text block.
    await this.page
      .getByRole('button', SELECTORS.textStylePicker)
      .first()
      .waitFor({ state: 'visible', timeout: 5000 })
      .catch(() => undefined)
  }

  private async applyHeadingStyle(level: 2 | 3): Promise<void> {
    await this.page.getByRole('button', SELECTORS.textStylePicker).first().click()
    const option = level === 2 ? SELECTORS.textStyleHeading2Option : SELECTORS.textStyleHeading3Option
    await this.page.getByRole('menuitem', option).click()
  }

  private async dismissFloatingToolbar(): Promise<void> {
    // Click somewhere neutral to dismiss any open toolbar before the next insertion.
    await this.page.keyboard.press('Escape')
    await this.page.waitForTimeout(150)
  }

  private safeLabel(s: string): string {
    return s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 60)
  }
}

/**
 * Resolve a path stored relative to TOOL_ROOT (e.g. `assets/foo/img.png`) into an
 * absolute path Playwright's setFiles can consume.
 */
export function toAbsoluteAssetPath(relativePath: string): string {
  return resolve(TOOL_ROOT, relativePath)
}
