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
  /** Vesper image generation gateway URL. */
  VESPER_API_URL: z.string().url().optional(),
  /** Vesper server-to-server auth secret. */
  VESPER_API_SECRET: z.string().min(1).optional(),
  /** Gemini API key for direct Nano Banana generation (Vesper fallback). */
  GEMINI_API_KEY: z.string().min(1).optional(),
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
