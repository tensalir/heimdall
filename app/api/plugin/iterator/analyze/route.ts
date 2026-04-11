/**
 * POST /api/plugin/iterator/analyze
 *
 * Primary entry point for the Iterator plugin. Accepts a source frame,
 * briefing, and mode, then returns a structured edit plan or generation brief.
 *
 * Auth: machine (plugin token via X-Heimdall-Plugin-Token or X-Heimdall-Secret)
 */

import { NextResponse } from 'next/server'
import { AnalyzeRequestSchema } from '../../../../src/iterator/types'
import { orchestrate, chooseMode } from '../../../../src/iterator/orchestrator'
import { createJob, updateJobStatus } from '../../../../src/iterator/jobs/iteratorJobs'

export const maxDuration = 120

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = AnalyzeRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const req = parsed.data
    if (!req.mode) {
      req.mode = chooseMode(req)
    }

    const job = await createJob(
      req.mode,
      req.sourceFrameId,
      req.sourceFileKey,
      req.briefing,
    )

    if (job) {
      await updateJobStatus(job.id, 'planning')
    }

    try {
      const plan = await orchestrate(req)

      if (job) {
        await updateJobStatus(job.id, 'completed', { edit_plan: plan })
      }

      return NextResponse.json({ jobId: job?.id, plan })
    } catch (planError) {
      if (job) {
        await updateJobStatus(job.id, 'failed', { error: (planError as Error).message })
      }
      throw planError
    }
  } catch (err) {
    console.error('[iterator/analyze] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Analysis failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
