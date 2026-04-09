/**
 * Briefing Assistant domain contracts.
 * Aligns with existing BriefingDTO so approval-to-Monday flow is lossless.
 */

import { z } from 'zod'
import type { BriefingDTO, VariantBlock } from '../briefing/schema.js'

/** Lifecycle state for a briefing assignment in the assistant. */
export type ApprovalStatus =
  | 'draft'
  | 'edited'
  | 'approved'
  | 'synced_to_monday'
  | 'queued'

/** Working-doc sections that mirror Monday briefing doc structure (used by mapping agent). */
export interface WorkingDocSections {
  idea?: string
  why?: string
  audience?: string
  product?: string
  visual?: string
  copyInfo?: string
  test?: string
  /** Variant rows A–D: type label + "Input visual + copy direction" + "Script" */
  variants?: string
}

/** How the assignment was created. */
export type AssignmentSource = 'split' | 'imported' | 'manual'

/** Single briefing row produced by the split engine, import, or manual create. */
export interface BriefingAssignment {
  id: string
  /** Content Bucket / Asset Mix */
  contentBucket: 'bau' | 'native_style' | 'experimental'
  /** Ideation starter text (from pool or AI-generated). */
  ideationStarter: string
  /** Product or use case (e.g. quiet, dream, bundles, engage kids). */
  productOrUseCase: string
  /** Brief owner (e.g. surya, leana, jon). */
  briefOwner: string
  /** Agency or Siobhan reference (e.g. Studio 1, Gain 1). */
  agencyRef: string
  /** Number of assets (typically 4). */
  assetCount: number
  /** Format: static, video, static_carousel, video_carousel. */
  format: string
  /** Funnel: tof, bof, retention. */
  funnel: string
  /** Optional campaign/partnership label. */
  campaignPartnership?: string
  /** Month/batch this assignment belongs to (e.g. 2026-01). */
  batchKey: string
  /** Human-readable brief name (e.g. Feb 1, Feb 2). */
  briefName: string
  /** How this assignment was created. */
  source?: AssignmentSource
  /** Per-assignment Monday board override; when set, send-to-Monday uses this board. */
  targetBoardId?: string | null
}

/** Generated angle (ideation output) for one assignment. */
export interface GeneratedAngle {
  id: string
  assignmentId: string
  title: string
  hook: string
  humanInsight: string
  confidenceLevel: 'high' | 'medium' | 'low'
  /** Source references for explainability. */
  dataRefs: string[]
  /** Product/datasource combination that produced this angle. */
  combination?: string
}

/** Editable working-doc state that maps to BriefingDTO for send-to-Monday. */
export interface WorkingDocState {
  experimentName: string
  batchCanonical: string
  batchRaw: string | null
  sectionName?: string
  sections: WorkingDocSections
  variants: VariantBlock[]
  /** Visual references / links added by the user. */
  visualRefs?: Array<{ url: string; label?: string }>
  status: ApprovalStatus
  /** Set when synced; links to Monday item. */
  mondayItemId?: string
  /** Set when queued for Figma. */
  figmaJobId?: string
}

/** Convert WorkingDocState to BriefingDTO for existing Monday/Figma pipeline. */
export function workingDocToBriefingDTO(
  state: WorkingDocState,
  mondayItemId: string
): BriefingDTO {
  return {
    mondayItemId,
    experimentName: state.experimentName,
    batchCanonical: state.batchCanonical,
    batchRaw: state.batchRaw,
    sectionName: state.sectionName,
    idea: state.sections.idea,
    audienceRegion: state.sections.audience,
    segment: state.sections.audience,
    formats: state.sections.variants
      ? `${state.sections.visual ?? ''}\n\nVariants: ${state.sections.variants}`.trim()
      : state.sections.visual,
    variants: state.variants,
    linkForReview: undefined,
    images:
      state.visualRefs?.map((v) => ({
        url: v.url,
        name: v.label ?? 'Reference',
        source: 'briefing_assistant',
      })) ?? undefined,
  }
}

// —— Zod schemas for API request/response validation ——

export const ApprovalStatusSchema = z.enum([
  'draft',
  'edited',
  'approved',
  'synced_to_monday',
  'queued',
])

export const WorkingDocSectionsSchema = z.object({
  idea: z.string().optional(),
  why: z.string().optional(),
  audience: z.string().optional(),
  product: z.string().optional(),
  visual: z.string().optional(),
  copyInfo: z.string().optional(),
  test: z.string().optional(),
  variants: z.string().optional(),
})

export const BriefingAssignmentSchema = z.object({
  id: z.string(),
  contentBucket: z.enum(['bau', 'native_style', 'experimental']),
  ideationStarter: z.string(),
  productOrUseCase: z.string(),
  briefOwner: z.string(),
  agencyRef: z.string(),
  assetCount: z.number().int().min(1),
  format: z.string(),
  funnel: z.string(),
  campaignPartnership: z.string().optional(),
  batchKey: z.string(),
  briefName: z.string(),
})

export const GeneratedAngleSchema = z.object({
  id: z.string(),
  assignmentId: z.string(),
  title: z.string(),
  hook: z.string(),
  humanInsight: z.string(),
  confidenceLevel: z.enum(['high', 'medium', 'low']),
  dataRefs: z.array(z.string()),
  combination: z.string().optional(),
})

export const WorkingDocStateSchema = z.object({
  experimentName: z.string(),
  batchCanonical: z.string(),
  batchRaw: z.string().nullable(),
  sectionName: z.string().optional(),
  sections: WorkingDocSectionsSchema,
  variants: z.array(
    z.object({
      id: z.enum(['A', 'B', 'C', 'D']),
      product: z.string().optional(),
      visualMessaging: z.string().optional(),
      headlines: z.string().optional(),
      description: z.string().optional(),
      cta: z.string().optional(),
      valueProp: z.string().optional(),
      headline: z.string().optional(),
      subline: z.string().optional(),
      bullets: z.string().optional(),
      note: z.string().optional(),
    })
  ),
  visualRefs: z
    .array(z.object({ url: z.string().url(), label: z.string().optional() }))
    .optional(),
  status: ApprovalStatusSchema,
  mondayItemId: z.string().optional(),
  figmaJobId: z.string().optional(),
})

export type WorkingDocSectionsInput = z.infer<typeof WorkingDocSectionsSchema>
