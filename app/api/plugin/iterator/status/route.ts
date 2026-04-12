/**
 * GET /api/plugin/iterator/status?jobId=...
 *
 * Returns the current status of an Iterator job, including the edit plan
 * and any generated assets.
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { getJob } from '@/src/iterator/jobs/iteratorJobs'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const jobId = searchParams.get('jobId')

  if (!jobId) {
    return NextResponse.json({ error: 'jobId is required' }, { status: 400 })
  }

  const job = await getJob(jobId)
  if (!job) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  }

  return NextResponse.json({ job })
}
