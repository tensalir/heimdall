/**
 * Centralized model selection for Mimir / Briefing Assistant.
 *
 * All Anthropic and Gemini model IDs used across briefing-assistant
 * routes are defined here so they can be updated in one place.
 */

/** Claude model used for briefing generation, analysis, scoring, and most text tasks. */
export const MIMIR_TEXT_MODEL = 'claude-sonnet-4-20250514'

/** Claude model used for Monday-to-Figma mapping (extended thinking). */
export const MAPPING_MODEL = 'claude-opus-4-6'

/** Default Gemini model ID for image generation via Vesper. */
export const MIMIR_IMAGE_MODEL = 'gemini-nano-banana-2'

/** Maximum tokens for briefing generation responses. */
export const MIMIR_BRIEFING_MAX_TOKENS = 2048

/** Maximum tokens for analysis/scoring responses. */
export const MIMIR_ANALYSIS_MAX_TOKENS = 1024

/** Maximum tokens for prompt-engineering (asset generation helper). */
export const MIMIR_PROMPT_ENGINEERING_MAX_TOKENS = 512

/** Maximum tokens for semantic tagging responses. */
export const MIMIR_TAGGING_MAX_TOKENS = 512
