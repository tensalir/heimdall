import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import {
  discoverAndProcess,
  discoverAll,
  getTopic,
  TOPICS,
} from '@/src/services/socialListeningDiscoveryService'
import { enqueueJob, startJob, completeJob, failJob } from '@/lib/discoveryJobs'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  const auth = await requireUser(req); if (auth.error) return auth.error

  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const { topic, sinceWeeks } = body as { topic?: string; sinceWeeks?: number }
  const weeks = sinceWeeks ?? 4

  if (topic && !getTopic(topic)) {
    return NextResponse.json(
      { error: `Unknown topic: ${topic}`, available: TOPICS.map((t) => t.id) },
      { status: 400 },
    )
  }

  const job = await enqueueJob('social_discovery', { topic: topic ?? 'all', sinceWeeks: weeks }, auth.user?.id)

  try {
    if (job) await startJob(job.id)

    if (topic) {
      const result = await discoverAndProcess(topic, weeks)
      const progress = { discovered: result.discovered, scored: result.scored, digest: result.digest, topics: [topic] }
      if (job) await completeJob(job.id, progress)
      return NextResponse.json({ ...progress, job_id: job?.id })
    }

    const results = await discoverAll(weeks)
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const totalScored = results.reduce((sum, r) => sum + r.scored, 0)
    const progress = { discovered: totalDiscovered, scored: totalScored, topics: results.map((r) => r.topic), breakdown: results }
    if (job) await completeJob(job.id, progress)
    return NextResponse.json({ ...progress, job_id: job?.id })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    console.error('[SocialListening] Error:', err)
    if (job) await failJob(job.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

export async function GET() {
  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }

  const job = await enqueueJob('social_discovery', { topic: 'all', source: 'cron' })

  try {
    if (job) await startJob(job.id)
    const results = await discoverAll()
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const progress = { discovered: totalDiscovered, topics: results.map((r) => r.topic), breakdown: results }
    if (job) await completeJob(job.id, progress)
    return NextResponse.json(progress)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    if (job) await failJob(job.id, message)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
