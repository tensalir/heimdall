/**
 * Iterator orchestrator — mode router and state machine.
 *
 * Receives a validated request, dispatches to the correct workflow,
 * manages job state transitions, and coordinates between
 * Claude (planning), Gemini (generation), and Figma (assembly).
 */

import type { AnalyzeRequest, EditPlan, IteratorMode } from './types'
import { planLayeredIteration } from './claude/layeredPlanner'
import { planBackgroundVariation } from './claude/backgroundPlanner'
import { planFlatVariants } from './claude/flatVariantPlanner'
import { planFromBriefing } from './claude/briefingPlanner'

export async function orchestrate(request: AnalyzeRequest): Promise<EditPlan> {
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

export function chooseMode(request: AnalyzeRequest): IteratorMode {
  if (request.briefing && !request.sourceFrameId) {
    return 'briefing-to-ad'
  }
  if (request.mode) return request.mode
  return 'layered-iteration'
}
