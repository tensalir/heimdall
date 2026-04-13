/**
 * Iterator orchestrator — mode router and state machine.
 *
 * Receives a validated request, dispatches to the correct workflow,
 * manages job state transitions, and coordinates between
 * Claude (planning + copy), Gemini (generation), and Figma (assembly).
 *
 * Before dispatching, enriches the request with a creative context pack
 * retrieved from the creative memory vector store when available.
 */

import type { AnalyzeRequest, EditPlan, CopyPlan, IterationResult, IteratorMode } from './types.js'
import { planLayeredIteration } from './claude/layeredPlanner.js'
import { planBackgroundVariation } from './claude/backgroundPlanner.js'
import { planFlatVariants } from './claude/flatVariantPlanner.js'
import { planFromBriefing } from './claude/briefingPlanner.js'
import { planCopy } from './claude/copyPlanner.js'
import { buildCreativeContextPack, isCreativeMemoryAvailable } from '../creativeMemory/store.js'

/**
 * Full orchestration: produces both a visual edit plan and
 * a paid-social copy plan in parallel.
 */
export async function orchestrate(request: AnalyzeRequest): Promise<IterationResult> {
  const enriched = await enrichWithCreativeContext(request)

  const [editPlan, copyPlan] = await Promise.all([
    orchestrateVisual(enriched),
    orchestrateCopy(enriched).catch((err) => {
      console.warn('[orchestrator] Copy planning failed, continuing without copy:', (err as Error).message)
      return undefined
    }),
  ])

  return { editPlan, copyPlan }
}

/**
 * Retrieve creative context from the memory store and attach it to the request.
 * Non-fatal: if retrieval fails or is unavailable, returns the original request.
 */
async function enrichWithCreativeContext(request: AnalyzeRequest): Promise<AnalyzeRequest> {
  if (!isCreativeMemoryAvailable()) return request
  if (request.creativeContext) return request // already enriched

  try {
    const queryParts: string[] = []
    if (request.briefing) queryParts.push(request.briefing)
    if (request.layerData) {
      const ld = request.layerData as Record<string, unknown>
      if (ld.name) queryParts.push(String(ld.name))
    }

    if (queryParts.length === 0) return request

    const pack = await buildCreativeContextPack(queryParts.join(' '), {
      maxReferences: 6,
    })

    if (pack.references.length === 0) return request

    return { ...request, creativeContext: pack }
  } catch (err) {
    console.warn('[orchestrator] Creative context retrieval failed (non-fatal):', (err as Error).message)
    return request
  }
}

/**
 * Visual-only orchestration (backward compatible).
 */
export async function orchestrateVisual(request: AnalyzeRequest): Promise<EditPlan> {
  const mode = request.mode

  switch (mode) {
    case 'layered-iteration':
      return planLayeredIteration(request)
    case 'ai-bg-plus-layers':
      return planBackgroundVariation(request)
    case 'flat-ai-variants':
      return planFlatVariants(request)
    case 'briefing-to-ad':
      return planFromBriefing(request)
    default: {
      const _exhaustive: never = mode
      throw new Error(`Unknown iterator mode: ${_exhaustive}`)
    }
  }
}

/**
 * Copy-only orchestration.
 */
export async function orchestrateCopy(request: AnalyzeRequest): Promise<CopyPlan> {
  return planCopy(request)
}

export function chooseMode(request: AnalyzeRequest): IteratorMode {
  if (request.briefing && !request.sourceFrameId) {
    return 'briefing-to-ad'
  }
  if (request.mode) return request.mode
  return 'layered-iteration'
}
