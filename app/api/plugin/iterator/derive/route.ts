/**
 * POST /api/plugin/iterator/derive
 *
 * Derives format variants from a master frame. The plugin sends the TRUE
 * source geometry (pre-resize snapshot) alongside the target ratio. The
 * planner uses the real master dimensions to compute conversion severity
 * and produce an edit plan in the target coordinate space.
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractFrameData } from '@/src/iterator/figma/extraction'
import { planResize } from '@/src/iterator/claude/resizePlanner'
import { createJob, updateJobStatus } from '@/src/iterator/jobs/iteratorJobs'

export const maxDuration = 120

const CANONICAL_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5': { w: 1440, h: 1800 },
  '1x1': { w: 1440, h: 1440 },
}

const DeriveRequestSchema = z.object({
  sourceFileKey: z.string(),
  sourceFrameId: z.string(),
  targetRatios: z.array(z.enum(['9x16', '4x5', '1x1'])).min(1),
  // True source geometry from the unmodified master
  sourceLayerData: z.record(z.unknown()).optional(),
  sourceWidth: z.number().optional(),
  sourceHeight: z.number().optional(),
  sourceRatio: z.string().optional(),
  // Legacy field kept for backward compatibility
  layerData: z.record(z.unknown()).optional(),
})

function detectRatio(w: number, h: number): string | null {
  for (const [key, dim] of Object.entries(CANONICAL_SIZES)) {
    if (Math.abs(w - dim.w) <= 2 && Math.abs(h - dim.h) <= 2) return key
  }
  return null
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = DeriveRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const {
      sourceFileKey,
      sourceFrameId,
      targetRatios,
      sourceLayerData,
      sourceWidth: explicitSourceW,
      sourceHeight: explicitSourceH,
      sourceRatio: explicitSourceRatio,
      layerData: legacyLayerData,
    } = parsed.data

    // Resolve source geometry: prefer explicit fields, then sourceLayerData, then Figma REST
    const layerData = sourceLayerData || legacyLayerData
    let sourceWidth = explicitSourceW || 0
    let sourceHeight = explicitSourceH || 0
    let sourceRatio = explicitSourceRatio || null
    let sourceName = 'unknown'
    let sourceChildren: unknown[] = []

    if (layerData) {
      if (!sourceWidth) sourceWidth = Number(layerData.width) || 0
      if (!sourceHeight) sourceHeight = Number(layerData.height) || 0
      sourceName = (layerData.name as string) || 'unknown'
      sourceChildren = (layerData.children as unknown[]) || []
    }

    // If we still don't have source dimensions, fetch from Figma REST
    if (!sourceWidth || !sourceHeight) {
      const extracted = await extractFrameData(sourceFileKey, sourceFrameId)
      if (!extracted) {
        return NextResponse.json({ error: 'Could not extract frame data' }, { status: 404 })
      }
      sourceWidth = extracted.width
      sourceHeight = extracted.height
      sourceName = extracted.name
      sourceChildren = extracted.children
    }

    // Detect source ratio from true master dimensions
    if (!sourceRatio) {
      sourceRatio = detectRatio(sourceWidth, sourceHeight)
    }

    const job = await createJob('layered-iteration', sourceFrameId, sourceFileKey)
    if (job) {
      await updateJobStatus(job.id, 'planning', {
        progress: { masterRatio: sourceRatio, targetRatios },
      })
    }

    const targetRatio = targetRatios[0]
    let editPlan = null

    try {
      editPlan = await planResize({
        layerData: layerData || {
          name: sourceName,
          width: sourceWidth,
          height: sourceHeight,
          children: sourceChildren,
        },
        sourceRatio,
        targetRatio,
        sourceWidth,
        sourceHeight,
      })
    } catch (planErr) {
      console.warn('[iterator/derive] Resize planning failed, plugin will use proportional fallback:', (planErr as Error).message)
    }

    if (job) {
      await updateJobStatus(job.id, editPlan ? 'completed' : 'failed', {
        edit_plan: editPlan,
        error: editPlan ? undefined : 'Planning returned no plan',
      })
    }

    return NextResponse.json({
      jobId: job?.id,
      master: {
        id: sourceFrameId,
        name: sourceName,
        width: sourceWidth,
        height: sourceHeight,
        detectedRatio: sourceRatio,
      },
      targetRatios,
      editPlan,
    })
  } catch (err) {
    console.error('[iterator/derive] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Derivation failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
