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

export interface EditPlan {
  mode: IteratorMode
  sourceDescription: string
  steps: EditStep[]
  targetRatios: string[]
  confidence: 'high' | 'medium' | 'low'
  humanReviewNeeded: boolean
  reasoning: string
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
