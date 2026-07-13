import { config as loadDotenv } from 'dotenv'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// tools/playbook-migration/src -> tools/playbook-migration
export const TOOL_ROOT = resolve(__dirname, '..')

// tools/playbook-migration -> tools -> repo root
export const REPO_ROOT = resolve(TOOL_ROOT, '..', '..')

loadDotenv({ path: resolve(TOOL_ROOT, '.env.local'), quiet: true })
loadDotenv({ path: resolve(TOOL_ROOT, '.env'), quiet: true })

const ConfigSchema = z.object({
  AZURE_TENANT_ID: z.string().min(1, 'AZURE_TENANT_ID is required for Microsoft Graph auth'),
  AZURE_CLIENT_ID: z.string().min(1, 'AZURE_CLIENT_ID is required for Microsoft Graph auth'),
  AZURE_CLIENT_SECRET: z.string().min(1, 'AZURE_CLIENT_SECRET is required for Microsoft Graph auth'),
  SHAREPOINT_HOSTNAME: z.string().min(1, 'SHAREPOINT_HOSTNAME is required (e.g. contoso.sharepoint.com)'),
  SHAREPOINT_SITE_PATH: z
    .string()
    .min(1, 'SHAREPOINT_SITE_PATH is required (e.g. /sites/PlaybookSite)')
    .startsWith('/', 'SHAREPOINT_SITE_PATH must start with /'),

  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-4-20250514'),

  GOOGLE_SITES_EDIT_URL: z.string().url().optional(),
  GOOGLE_SITES_TARGET_SUBPATH: z.string().optional(),
})

export type Config = z.infer<typeof ConfigSchema>

let cached: Config | undefined

/**
 * Lazy, partial config loader. Each command only validates the env it needs:
 * extract requires Azure + SharePoint, translate requires Anthropic, author requires Google.
 */
export function loadConfig(stage: 'extract' | 'translate' | 'author'): Config {
  if (cached) return cached

  const raw = {
    AZURE_TENANT_ID: process.env.AZURE_TENANT_ID,
    AZURE_CLIENT_ID: process.env.AZURE_CLIENT_ID,
    AZURE_CLIENT_SECRET: process.env.AZURE_CLIENT_SECRET,
    SHAREPOINT_HOSTNAME: process.env.SHAREPOINT_HOSTNAME,
    SHAREPOINT_SITE_PATH: process.env.SHAREPOINT_SITE_PATH,
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
    GOOGLE_SITES_EDIT_URL: process.env.GOOGLE_SITES_EDIT_URL,
    GOOGLE_SITES_TARGET_SUBPATH: process.env.GOOGLE_SITES_TARGET_SUBPATH,
  }

  const parsed = ConfigSchema.safeParse(raw)
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Invalid configuration in .env.local:\n${issues}`)
  }

  if (stage === 'translate' && !parsed.data.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required for the translate stage. Set it in .env.local.')
  }
  if (stage === 'author' && !parsed.data.GOOGLE_SITES_EDIT_URL) {
    throw new Error('GOOGLE_SITES_EDIT_URL is required for the author stage. Set it in .env.local.')
  }

  cached = parsed.data
  return cached
}

export const PATHS = {
  pages: resolve(TOOL_ROOT, 'pages'),
  assets: resolve(TOOL_ROOT, 'assets'),
  output: resolve(TOOL_ROOT, 'output'),
  playwrightProfile: resolve(TOOL_ROOT, '.playwright-profile'),
  skill: resolve(REPO_ROOT, 'skills', 'loop-playbook-migration', 'SKILL.md'),
} as const
