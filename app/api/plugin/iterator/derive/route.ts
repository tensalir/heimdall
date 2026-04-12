/**
 * POST /api/plugin/iterator/derive
 *
 * Derives format variants from a master frame using the performance-design
 * skill's resize workflow. Coordinates with Figma MCP or REST API.
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractFrameData } from '@/src/iterator/figma/extraction'
import { createJob, updateJobStatus } from '@/src/iterator/jobs/iteratorJobs'

export const maxDuration = 120

const DeriveRequestSchema = z.object({
  sourceFileKey: z.string(),
  sourceFrameId: z.string(),
  targetRatios: z.array(z.enum(['9x16', '4x5', '1x1'])).min(1),
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

    const { sourceFileKey, sourceFrameId, targetRatios } = parsed.data

    const frameData = await extractFrameData(sourceFileKey, sourceFrameId)
    if (!frameData) {
      return NextResponse.json({ error: 'Could not extract frame data' }, { status: 404 })
    }

    const job = await createJob('layered-iteration', sourceFrameId, sourceFileKey)
    if (job) {
      await updateJobStatus(job.id, 'planning', {
        progress: { masterRatio: frameData.detectedRatio, targetRatios },
      })
    }

    // TODO: invoke the performance-design skill's resize workflow
    // for each target ratio. For now, return the frame analysis.

    return NextResponse.json({
      jobId: job?.id,
      master: frameData,
      targetRatios,
      status: 'Variant derivation planned. Resize execution not yet wired.',
    })
  } catch (err) {
    console.error('[iterator/derive] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Derivation failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
