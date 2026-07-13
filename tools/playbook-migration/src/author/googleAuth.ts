import { mkdir } from 'node:fs/promises'
import { chromium, type BrowserContext, type Page } from 'playwright'

import { PATHS } from '../config.js'

export interface GoogleSession {
  context: BrowserContext
  page: Page
  close: () => Promise<void>
}

export interface OpenSessionOptions {
  /** Run headless. Defaults to false on the first run so the user can log in. */
  headless?: boolean
  /**
   * Slow each Playwright action by N ms (only takes effect when launching).
   * Useful when debugging fragile selectors.
   */
  slowMo?: number
}

/**
 * Open a Playwright Chromium with a persistent profile dir. The first time you run
 * `npm run author`, a browser window opens; you log into Google manually; the session
 * is saved to .playwright-profile/ and reused on subsequent runs.
 *
 * The profile dir is gitignored. Treat it like an authenticated session: do not commit,
 * do not share. Re-running `rm -rf .playwright-profile/` forces a fresh login.
 */
export async function openGoogleSession(options: OpenSessionOptions = {}): Promise<GoogleSession> {
  await mkdir(PATHS.playwrightProfile, { recursive: true })

  const headless = options.headless ?? false

  const context = await chromium.launchPersistentContext(PATHS.playwrightProfile, {
    headless,
    slowMo: options.slowMo,
    viewport: { width: 1440, height: 900 },
    // Modern Sites breaks under headless without a realistic UA. Use Chrome's default UA.
  })

  const page = context.pages()[0] ?? (await context.newPage())

  return {
    context,
    page,
    close: async () => {
      await context.close()
    },
  }
}

/**
 * Heuristic check that the active session is signed into Google. Walks navbar avatars and
 * confirms there's no "Sign in" CTA on the current page. The caller is expected to be
 * already pointing the page at a Google domain when this runs.
 */
export async function ensureSignedIn(page: Page, expectedAccountHint?: string): Promise<void> {
  const signInVisible = await page.getByRole('link', { name: /sign in/i }).first().isVisible().catch(() => false)
  if (signInVisible) {
    throw new Error(
      'Not signed into Google. Run `npm run author` once with a non-headless browser, log in manually, then re-run.',
    )
  }
  if (expectedAccountHint) {
    const accountText = await page
      .locator(`text=${expectedAccountHint}`)
      .first()
      .textContent()
      .catch(() => null)
    if (!accountText) {
      console.warn(
        `[author] Could not confirm signed-in as "${expectedAccountHint}". Continuing anyway; verify in the screenshots.`,
      )
    }
  }
}
