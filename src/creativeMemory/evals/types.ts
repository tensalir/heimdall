/**
 * Evaluation types for creative memory human-judged quality assessment.
 *
 * Each eval case describes a task, expected behavior, and scoring rubric.
 * Results are collected via the eval runner and stored for comparison
 * across iterations of the retrieval/planning system.
 */

export type EvalTaskType =
  | 'new-ad-from-briefing'
  | 'safe-variant'
  | 'adjacent-composition-variant'

export interface EvalCase {
  id: string
  taskType: EvalTaskType
  /** Human-readable description of what the task asks for */
  description: string
  /** The briefing or context that will be passed to the Iterator */
  briefing: string
  /** Product for metadata filtering */
  product?: string
  /** Use case for metadata filtering */
  useCase?: string
  /** Source frame reference (for variant tasks) */
  sourceFrameRef?: string
  /** What a good result looks like */
  expectedBehavior: string
  /** What a bad result looks like */
  failureModes: string[]
}

export interface EvalScore {
  /** Was the retrieved context useful for this task? (1-5) */
  retrievalUsefulness: number
  /** Does the proposed composition look plausible? (1-5) */
  compositionPlausibility: number
  /** Are story-carrying elements preserved? (1-5) */
  storyPreservation: number
  /** Does the output feel like a Loop ad? (1-5) */
  brandFit: number
  /** Could this go to production with minor tweaks? (1-5) */
  productionReadiness: number
}

export interface EvalResult {
  caseId: string
  /** Which version of the system produced this result */
  systemVersion: string
  scores: EvalScore
  /** Free-form notes from the human reviewer */
  reviewerNotes: string
  /** Did the reviewer accept, flag for revision, or reject? */
  verdict: 'accept' | 'revise' | 'reject'
  /** Timestamp of the evaluation */
  evaluatedAt: string
}

export interface EvalSuite {
  name: string
  version: string
  cases: EvalCase[]
}
