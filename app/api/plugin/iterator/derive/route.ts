/**
 * POST /api/plugin/iterator/derive
 *
 * Derives format variants from a master frame. Accepts the source frame
 * ID + file key and target ratios, then returns a per-ratio EditPlan
 * with move/scale/reflow/crop-shift steps the plugin can apply.
 *
 * When layerData is provided by the plugin (post-clone snapshot), the
 * planner uses it directly. Otherwise falls back to Figma REST extraction.
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
  layerData: z.record(z.unknown()).optional(),
})

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

    const { sourceFileKey, sourceFrameId, targetRatios, layerData: pluginLayerData } = parsed.data

    // Use plugin-provided layer data if available, otherwise fetch from Figma REST
    let frameData = pluginLayerData
      ? {
          id: sourceFrameId,
          name: (pluginLayerData.name as string) || 'unknown',
          width: Number(pluginLayerData.width) || 0,
          height: Number(pluginLayerData.height) || 0,
          children: (pluginLayerData.children as unknown[]) || [],
          detectedRatio: null as string | null,
        }
      : null

    if (!frameData) {
      const extracted = await extractFrameData(sourceFileKey, sourceFrameId)
      if (!extracted) {
        return NextResponse.json({ error: 'Could not extract frame data' }, { status: 404 })
      }
      frameData = extracted
    }

    // Detect source ratio from dimensions
    const sourceRatio = Object.entries(CANONICAL_SIZES).find(
      ([, dim]) => Math.abs(frameData!.width - dim.w) <= 2 && Math.abs(frameData!.height - dim.h) <= 2,
    )?.[0] || null

    const job = await createJob('layered-iteration', sourceFrameId, sourceFileKey)
    if (job) {
      await updateJobStatus(job.id, 'planning', {
        progress: { masterRatio: sourceRatio, targetRatios },
      })
    }

    // Plan resize for each target ratio (first one for now; plugin calls per-ratio)
    const targetRatio = targetRatios[0]
    let editPlan = null

    try {
      editPlan = await planResize({
        layerData: pluginLayerData || {
          name: frameData.name,
          width: frameData.width,
          height: frameData.height,
          children: frameData.children,
        },
        sourceRatio,
        targetRatio,
        sourceWidth: frameData.width,
        sourceHeight: frameData.height,
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
        id: frameData.id,
        name: frameData.name,
        width: frameData.width,
        height: frameData.height,
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
