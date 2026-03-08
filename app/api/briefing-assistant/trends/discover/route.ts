import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import {
  discoverAndProcess,
  discoverAll,
  getVertical,
  VERTICALS,
} from '@/src/services/trendDiscoveryService'
import { enqueueJob, startJob, completeJob, failJob } from '@/lib/discoveryJobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/briefing-assistant/trends/discover
 * Enqueues a durable job, runs discovery synchronously (within the 120s limit),
 * and records progress/completion in the job row so the UI can poll status.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req); if (auth.error) return auth.error

  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const { vertical } = body as { vertical?: string }

  if (vertical && !getVertical(vertical)) {
    return NextResponse.json(
      { error: `Unknown vertical: ${vertical}`, available: VERTICALS.map((v) => v.id) },
      { status: 400 },
    )
  }

  const job = await enqueueJob('trend_discovery', { vertical: vertical ?? 'all' }, auth.user?.id)

  try {
    if (job) await startJob(job.id)

    if (vertical) {
      const result = await discoverAndProcess(vertical)
      const progress = { discovered: result.discovered, scored: result.scored, digest: result.digest, verticals: [vertical] }
      if (job) await completeJob(job.id, progress)
      return NextResponse.json({ ...progress, job_id: job?.id })
    }

    const results = await discoverAll()
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const totalScored = results.reduce((sum, r) => sum + r.scored, 0)
    const progress = { discovered: totalDiscovered, scored: totalScored, verticals: results.map((r) => r.vertical), breakdown: results }
    if (job) await completeJob(job.id, progress)
    return NextResponse.json({ ...progress, job_id: job?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    console.error('[TrendDiscover] Error:', err)
    if (job) await failJob(job.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const job = await enqueueJob('trend_discovery', { vertical: 'all', source: 'cron' })

  try {
    if (job) await startJob(job.id)
    const results = await discoverAll()
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const progress = { discovered: totalDiscovered, verticals: results.map((r) => r.vertical), breakdown: results }
    if (job) await completeJob(job.id, progress)
    return NextResponse.json(progress)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    if (job) await failJob(job.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
