/**
 * Heimdall: Monday status -> Figma experiment page automation.
 */

export { parseBatchToCanonical, expectedFileNameFromCanonicalKey } from './domain/routing/batchToFile.js'
export type { BatchParseResult } from './domain/routing/batchToFile.js'
export { resolveFigmaTarget, resolveFigmaTargetByCanonicalKey } from './orchestration/resolveFigmaTarget.js'
export type { FigmaTargetResult } from './orchestration/resolveFigmaTarget.js'
export type { BriefingDTO, VariantBlock } from './domain/briefing/schema.js'
export { formatExperimentPageName } from './domain/briefing/schema.js'
export { getEnv, isDryRun } from './config/env.js'
export type { Env } from './config/env.js'
export { createOrQueueFigmaPage, buildIdempotencyKey } from './orchestration/createOrQueueFigmaPage.js'
export type { CreateOrQueueResult, CreateOrQueueOutcome } from './orchestration/createOrQueueFigmaPage.js'
