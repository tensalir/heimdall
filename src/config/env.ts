/**
 * Environment and secrets contract for Heimdall.
 * MONDAY_* for webhook and API; FIGMA_* for file access; optional mapping store.
 */

import { z } from 'zod'

const envSchema = z.object({
  MONDAY_API_TOKEN: z.string().min(1).optional(),
  MONDAY_SIGNING_SECRET: z.string().min(1).optional(),
  MONDAY_BOARD_ID: z.string().optional(),
  MONDAY_STATUS_FIGMA_READY: z.string().optional(),
  /** Optional strict eligibility gate for webhook queueing. */
  MONDAY_ENFORCE_FILTERS: z.enum(['true', 'false', '1', '0', '']).optional(),
  /** CSV allowlist for status values (e.g. "ready for review,brief ready / approved"). */
  MONDAY_ALLOWED_STATUS_VALUES: z.string().optional(),
  /** CSV allowlist for assignment/team values (e.g. "studio,content creation"). */
  MONDAY_ALLOWED_TEAM_VALUES: z.string().optional(),
  FIGMA_ACCESS_TOKEN: z.string().min(1).optional(),
  FIGMA_TEMPLATE_FILE_KEY: z.string().optional(),
  /** JSON map of canonical month key (e.g. "2026-03") to Figma file key. */
  HEIMDALL_BATCH_FILE_MAP: z.string().optional(),
  /** Dry run: do not write to Figma or Monday. */
  HEIMDALL_DRY_RUN: z.enum(['true', 'false', '1', '0', '']).optional(),
  /** Claude API key for mapping agent; omit to use column-only fallback. */
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  /** Extended thinking budget for mapping agent (default 10000). */
  ANTHROPIC_THINKING_BUDGET: z.string().optional(),
  /** Plugin: CSV status values (e.g. "brief ready,approved"). */
  PLUGIN_FILTER_STATUS: z.string().optional(),
  /** Plugin: CSV creative partner values (e.g. "studio,content creation"). */
  PLUGIN_FILTER_CREATIVE_PARTNER: z.string().optional(),
  /** Supabase (evidence RAG, comments, auth). Server-side only. */
  SUPABASE_URL: z.string().url().optional(),
  SUPABASE_SERVICE_KEY: z.string().min(1).optional(),
  /** Voyage AI key for evidence embeddings (1024-d). Used by ingestion script and server retrieval. */
  VOYAGE_API_KEY: z.string().min(1).optional(),
  /** Babylon localization ingest endpoint for plugin wordcount runs. */
  LOCALIZATION_BABYLON_INGEST_URL: z.string().url().optional(),
  /** Shared HMAC secret for Heimdall -> Babylon ingest authentication. */
  LOCALIZATION_BABYLON_SHARED_SECRET: z.string().min(1).optional(),
  /** Optional key identifier header for key rotation support. */
  LOCALIZATION_BABYLON_KEY_ID: z.string().optional(),
  /** Frontify asset linking: Bearer token for GraphQL API. */
  FRONTIFY_ACCESS_TOKEN: z.string().min(1).optional(),
  FRONTIFY_API_KEY: z.string().min(1).optional(),
  /** Frontify instance domain (e.g. loop.frontify.com). */
  FRONTIFY_DOMAIN: z.string().optional(),
  /** Library ID for folder creation (API ID). */
  FRONTIFY_LIBRARY_ID: z.string().optional(),
  /** URL path segment for asset link (e.g. document/12). */
  FRONTIFY_DOCUMENT_PATH: z.string().optional(),
  /** Monday: column ID of the Assets column for Frontify URL. */
  MONDAY_ASSETS_COLUMN_ID: z.string().optional(),
  /** Monday: CSV of board IDs to enable asset linking on (empty = all boards). */
  MONDAY_ASSETS_BOARD_IDS: z.string().optional(),
  /** Monday: status value that triggers asset link (e.g. "Approved"). Comparison is case-insensitive. */
  MONDAY_ASSETS_STATUS_APPROVED: z.string().optional(),
  /** Meta Ad Library API access token for ad ingestion. */
  META_AD_LIBRARY_ACCESS_TOKEN: z.string().min(1).optional(),
  /** Apify API token for Meta ads scraping via Apify Actors. */
  APIFY_API_TOKEN: z.string().min(1).optional(),
  /** Source mode for Meta ads ingestion: 'searchapi' | 'apify' | 'browser' | 'api' | 'auto' (default). */
  META_ADS_SOURCE_MODE: z.enum(['searchapi', 'apify', 'browser', 'api', 'auto']).optional(),
  /** SearchAPI key for scalable Meta Ad Library scraping. */
  SEARCHAPI_API_KEY: z.string().min(1).optional(),
  /** Default region for Meta ads scraping (ISO country code, e.g. 'US'). */
  META_ADS_DEFAULT_REGION: z.string().optional(),
  /** HTTP/SOCKS proxy URL for browser scraping (EU reliability). */
  META_ADS_PROXY_URL: z.string().optional(),
  /** Vesper image generation gateway URL. */
  VESPER_API_URL: z.string().url().optional(),
  /** Vesper server-to-server auth secret. */
  VESPER_API_SECRET: z.string().min(1).optional(),
  /** Gemini API key for direct Nano Banana generation (Vesper fallback). */
  GEMINI_API_KEY: z.string().min(1).optional(),
  /** Supabase public URL (client-side auth). */
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  /** Supabase anon key (client-side auth). */
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
  /** Exa web search key for trend/social discovery. */
  EXA_API_KEY: z.string().min(1).optional(),
  /** Perplexity API key for digest synthesis. */
  PERPLEXITY_API_KEY: z.string().min(1).optional(),
  /** Figma team IDs for project browser (comma-separated). */
  FIGMA_TEAM_IDS: z.string().optional(),
  /** Vercel KV REST URL (auto-set when linking KV store). */
  KV_REST_API_URL: z.string().url().optional(),
  /** Vercel KV REST token. */
  KV_REST_API_TOKEN: z.string().min(1).optional(),
  /** Sheets/reviewer cookie auth password. */
  SHEETS_PASSWORD: z.string().min(1).optional(),
  /** Briefing Assistant local dev password. */
  BRIEFING_LOCAL_PASSWORD: z.string().min(1).optional(),
  /** Shared secret for machine-to-machine API auth (jobs, cron). */
  HEIMDALL_MACHINE_SECRET: z.string().min(1).optional(),
  /** Separate secret for Figma plugin auth. Revocable independently from machine secret. */
  HEIMDALL_PLUGIN_SECRET: z.string().min(1).optional(),
  /** Secret for Custom GPT Actions hitting /api/gpt-actions/* (header or Bearer). */
  HEIMDALL_GPT_ACTIONS_SECRET: z.string().min(1).optional(),
  /** LlamaCloud API key for LlamaParse (document chat). Also accepts LLAMA_PARSE_API_KEY in SDK. */
  LLAMA_CLOUD_API_KEY: z.string().min(1).optional(),
  /** LlamaParse tier: fast | cost_effective | agentic | agentic_plus (default cost_effective). */
  LLAMA_PARSE_TIER: z.enum(['fast', 'cost_effective', 'agentic', 'agentic_plus']).optional(),
  /** LlamaParse tier version (default latest). Pin e.g. 2026-03-04 in production. */
  LLAMA_PARSE_VERSION: z.string().optional(),
  /** CSV of email domains allowed for privileged access (admin/ops/forecast/feedback). Defaults to thoughtform.co,loopearplugs.com. */
  HEIMDALL_ALLOWED_EMAIL_DOMAINS: z.string().optional(),
  /** Client-side mirror of HEIMDALL_ALLOWED_EMAIL_DOMAINS for sidebar gating. Non-secret. */
  NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS: z.string().optional(),
  /** CSV of full email addresses allowed to use the ops feedback-review workflow. */
  HEIMDALL_FEEDBACK_REVIEWERS: z.string().optional(),
  /** Client-side mirror of HEIMDALL_FEEDBACK_REVIEWERS for UI gating. Non-secret. */
  NEXT_PUBLIC_HEIMDALL_FEEDBACK_REVIEWERS: z.string().optional(),
  /** Monday briefing board ID for sprint integration. */
  MONDAY_BRIEFING_BOARD_ID: z.string().optional(),
  /** Monday briefing doc column ID. */
  MONDAY_BRIEFING_DOC_COLUMN_ID: z.string().optional(),
  /** Monday briefing group ID. */
  MONDAY_BRIEFING_GROUP_ID: z.string().optional(),

  // HiBob → Monday leave sync
  /** HiBob service user ID for API authentication. */
  HIBOB_SERVICE_USER_ID: z.string().min(1).optional(),
  /** HiBob service user API token. */
  HIBOB_API_TOKEN: z.string().min(1).optional(),
  /** Shared secret appended as ?secret= to the HiBob webhook URL for verification. */
  HIBOB_WEBHOOK_SECRET: z.string().min(1).optional(),
  /** Monday board ID for the team/leave board (e.g. 4826368978). */
  MONDAY_HIBOB_BOARD_ID: z.string().optional(),
  /** Monday column ID used for email lookup (join key). */
  MONDAY_HIBOB_EMAIL_COLUMN_ID: z.string().optional(),
  /** Monday status column ID to write leave status into. */
  MONDAY_HIBOB_STATUS_COLUMN_ID: z.string().optional(),
  /** Optional: column ID for leave type (text). */
  MONDAY_HIBOB_LEAVE_TYPE_COLUMN_ID: z.string().optional(),
  /** Optional: column ID for leave start date. */
  MONDAY_HIBOB_LEAVE_START_COLUMN_ID: z.string().optional(),
  /** Optional: column ID for leave end date. */
  MONDAY_HIBOB_LEAVE_END_COLUMN_ID: z.string().optional(),
})

export type Env = z.infer<typeof envSchema>

let cached: Env | null = null

export function getEnv(): Env {
  if (cached) return cached
  const parsed = envSchema.safeParse(process.env)
  if (!parsed.success) {
    console.warn('[Heimdall] Env validation warnings:', parsed.error.flatten())
  }
  cached = (parsed.success ? parsed.data : {}) as Env
  return cached
}

export function isDryRun(): boolean {
  const v = getEnv().HEIMDALL_DRY_RUN
  return v === 'true' || v === '1'
}
