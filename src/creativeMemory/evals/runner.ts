/**
 * Eval runner for creative memory.
 *
 * Executes eval cases against the live creative memory system,
 * collects the system's output (retrieved context + proposed plan),
 * and formats them for human review. Does NOT auto-score — the
 * scoring rubric is filled in by the design team.
 */

import type { EvalCase, EvalResult, EvalScore } from './types.js'
import { CREATIVE_MEMORY_EVAL_SUITE } from './suite.js'
import { buildCreativeContextPack, isCreativeMemoryAvailable } from '../store.js'
import { orchestrate, chooseMode } from '../../iterator/orchestrator.js'
import type { AnalyzeRequest, IteratorMode } from '../../iterator/types.js'

export interface EvalRunOutput {
  caseId: string
  taskType: string
  description: string
  expectedBehavior: string
  failureModes: string[]
  /** The creative context pack that was retrieved */
  retrievedContext: {
    referenceCount: number
    patternSummary: string
    topReferences: Array<{
      familyName: string
      archetype: string
      mood: string
      similarity: number
    }>
  } | null
  /** The edit plan or generation brief produced by the planner */
  planSummary: {
    mode: IteratorMode
    confidence: string
    reasoning: string
    storyPreservation?: {
      storySubject: string
      occlusionRisk: string
    }
    stepCount: number
  } | null
  /** Any errors encountered during execution */
  error: string | null
}

/**
 * Run all eval cases and return outputs for human review.
 * Set dryRun=true to skip the planner call and only test retrieval.
 */
export async function runEvalSuite(
  opts?: { dryRun?: boolean; filterType?: string; limit?: number },
): Promise<EvalRunOutput[]> {
  const results: EvalRunOutput[] = []
  let cases = CREATIVE_MEMORY_EVAL_SUITE.cases

  if (opts?.filterType) {
    cases = cases.filter((c) => c.taskType === opts.filterType)
  }
  if (opts?.limit) {
    cases = cases.slice(0, opts.limit)
  }

  for (const evalCase of cases) {
    const output = await runSingleCase(evalCase, opts?.dryRun ?? false)
    results.push(output)
  }

  return results
}

async function runSingleCase(evalCase: EvalCase, dryRun: boolean): Promise<EvalRunOutput> {
  const output: EvalRunOutput = {
    caseId: evalCase.id,
    taskType: evalCase.taskType,
    description: evalCase.description,
    expectedBehavior: evalCase.expectedBehavior,
    failureModes: evalCase.failureModes,
    retrievedContext: null,
    planSummary: null,
    error: null,
  }

  try {
    // Step 1: Retrieve creative context
    if (isCreativeMemoryAvailable()) {
      const pack = await buildCreativeContextPack(evalCase.briefing, {
        maxReferences: 6,
        product: evalCase.product,
        useCase: evalCase.useCase,
      })

      output.retrievedContext = {
        referenceCount: pack.references.length,
        patternSummary: pack.patternSummary,
        topReferences: pack.references.slice(0, 3).map((ref) => ({
          familyName: ref.familyName,
          archetype: ref.fingerprint.compositionArchetype,
          mood: ref.fingerprint.paletteMood,
          similarity: ref.similarity,
        })),
      }
    }

    // Step 2: Run the planner (skip in dry-run mode)
    if (!dryRun) {
      const mode = evalCase.taskType === 'new-ad-from-briefing'
        ? 'briefing-to-ad' as IteratorMode
        : evalCase.taskType === 'adjacent-composition-variant'
          ? 'flat-ai-variants' as IteratorMode
          : 'layered-iteration' as IteratorMode

      const request: AnalyzeRequest = {
        mode,
        briefing: evalCase.briefing,
        sourceFrameId: evalCase.sourceFrameRef,
      }

      const result = await orchestrate(request)

      output.planSummary = {
        mode: result.editPlan.mode,
        confidence: result.editPlan.confidence,
        reasoning: result.editPlan.reasoning,
        storyPreservation: result.editPlan.storyPreservation
          ? {
              storySubject: result.editPlan.storyPreservation.storySubject,
              occlusionRisk: result.editPlan.storyPreservation.occlusionRisk,
            }
          : undefined,
        stepCount: result.editPlan.steps.length,
      }
    }
  } catch (err) {
    output.error = (err as Error).message
  }

  return output
}

/**
 * Compute aggregate scores from a set of eval results.
 */
export function computeAggregateScores(results: EvalResult[]): {
  averageScores: EvalScore
  verdictCounts: Record<string, number>
  totalCases: number
} {
  const totals: EvalScore = {
    retrievalUsefulness: 0,
    compositionPlausibility: 0,
    storyPreservation: 0,
    brandFit: 0,
    productionReadiness: 0,
  }

  const verdicts: Record<string, number> = { accept: 0, revise: 0, reject: 0 }

  for (const result of results) {
    totals.retrievalUsefulness += result.scores.retrievalUsefulness
    totals.compositionPlausibility += result.scores.compositionPlausibility
    totals.storyPreservation += result.scores.storyPreservation
    totals.brandFit += result.scores.brandFit
    totals.productionReadiness += result.scores.productionReadiness
    verdicts[result.verdict] = (verdicts[result.verdict] ?? 0) + 1
  }

  const n = results.length || 1

  return {
    averageScores: {
      retrievalUsefulness: totals.retrievalUsefulness / n,
      compositionPlausibility: totals.compositionPlausibility / n,
      storyPreservation: totals.storyPreservation / n,
      brandFit: totals.brandFit / n,
      productionReadiness: totals.productionReadiness / n,
    },
    verdictCounts: verdicts,
    totalCases: results.length,
  }
}
