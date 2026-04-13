import { z } from 'zod'

export type IteratorMode = 'layered-iteration' | 'ai-bg-plus-layers' | 'flat-ai-variants' | 'briefing-to-ad'

export type IteratorJobStatus = 'queued' | 'planning' | 'generating' | 'assembling' | 'reviewing' | 'completed' | 'failed'

export const AnalyzeRequestSchema = z.object({
  mode: z.enum(['layered-iteration', 'ai-bg-plus-layers', 'flat-ai-variants', 'briefing-to-ad']),
  sourceFrameId: z.string().optional(),
  sourceFileKey: z.string().optional(),
  briefing: z.string().optional(),
  referenceFrameIds: z.array(z.string()).optional(),
  targetRatios: z.array(z.enum(['9x16', '4x5', '1x1'])).optional(),
  layerData: z.record(z.unknown()).optional(),
})

export type AnalyzeRequest = z.infer<typeof AnalyzeRequestSchema>

export interface StoryPreservation {
  storySubject: string
  protectedRegions: string[]
  occlusionRisk: 'low' | 'medium' | 'high'
  recommendedAdjustment: 'none' | 'move_up' | 'move_down' | 'move_left' | 'move_right' | 'shrink_overlay' | 'reformat_overlay'
  rationale: string
}

export interface EditPlan {
  mode: IteratorMode
  sourceDescription: string
  steps: EditStep[]
  targetRatios: string[]
  confidence: 'high' | 'medium' | 'low'
  humanReviewNeeded: boolean
  reasoning: string
  storyPreservation?: StoryPreservation
}

export interface EditStep {
  action: 'copy-change' | 'move' | 'scale' | 'reflow' | 'add-layer' | 'remove-layer' | 'crop-shift' | 'generate-background' | 'generate-flat'
  targetNodeId?: string
  targetNodeName?: string
  params: Record<string, unknown>
  rationale: string
}

export type NanoBananaModel = 'nano-banana-pro' | 'nano-banana-2'

export interface GenerationBrief {
  prompt: string
  referenceImageUrls: string[]
  aspectRatio: '4:5' | '9:16' | '1:1' | '16:9' | '2:3' | '3:2' | '3:4' | '4:3' | '5:4'
  resolution: '512' | '1K' | '2K' | '4K'
  style?: 'photorealistic' | 'editorial' | 'illustration' | 'product-render'
}

export interface CopyVariant {
  captionPrimaryText: string
  headline: string
  description: string
  cta: string
  productAssignment: string
  hookType: 'question' | 'callout' | 'confession' | 'micro-drama' | 'identity-statement' | string
  angle: string
}

export interface CopyPlan {
  variants: CopyVariant[]
  copyStrategy: 'shared_caption' | 'per_variant'
  qaFlags: string[]
  nextTestIdeas: string[]
  reasoning: string
}

export interface IterationResult {
  editPlan: EditPlan
  copyPlan?: CopyPlan
}

export interface IteratorJob {
  id: string
  mode: IteratorMode
  status: IteratorJobStatus
  source_frame_id: string | null
  source_file_key: string | null
  briefing: string | null
  edit_plan: EditPlan | null
  progress: Record<string, unknown>
  error: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
}

export interface IteratorGeneratedAsset {
  id: string
  job_id: string
  asset_type: 'flat-variant' | 'background' | 'assembled-frame'
  aspect_ratio: string
  image_url: string
  prompt: string | null
  model: string | null
  metadata: Record<string, unknown>
  created_at: string
}

// ---------------------------------------------------------------------------
// Post-placement auto-framing review
// ---------------------------------------------------------------------------

export interface PlacementReviewRequest {
  previewImageBase64: string
  mimeType: string
  rectWidth: number
  rectHeight: number
  imageWidth: number
  imageHeight: number
  context?: string
}

export type PlacementAction = 'keep' | 'adjust'

export interface CropAdjustment {
  action: PlacementAction
  zoomDelta: number
  panX: number
  panY: number
  confidence: 'high' | 'medium' | 'low'
  reason: string
}

export const PLACEMENT_REVIEW_DEFAULTS: CropAdjustment = {
  action: 'keep',
  zoomDelta: 0,
  panX: 0,
  panY: 0,
  confidence: 'high',
  reason: 'Initial placement accepted',
}

export const MAX_REVIEW_PASSES = 2
