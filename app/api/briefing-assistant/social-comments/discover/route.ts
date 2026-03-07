import { NextRequest, NextResponse } from 'next/server'
import {
  discoverAndProcess,
  discoverAll,
  getTopic,
  TOPICS,
} from '@/src/services/socialListeningDiscoveryService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/briefing-assistant/social-comments/discover
 * Body: { topic?: string, sinceWeeks?: number }
 * Triggers social listening discovery for a single topic or all topics.
 */
export async function POST(req: NextRequest) {
  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const { topic, sinceWeeks } = body as { topic?: string; sinceWeeks?: number }
  const weeks = sinceWeeks ?? 4

  try {
    if (topic) {
      if (!getTopic(topic)) {
        return NextResponse.json(
          {
            error: `Unknown topic: ${topic}`,
            available: TOPICS.map((t) => t.id),
          },
          { status: 400 },
        )
      }

      const result = await discoverAndProcess(topic, weeks)
      return NextResponse.json({
        discovered: result.discovered,
        scored: result.scored,
        digest: result.digest,
        topics: [topic],
      })
    }

    const results = await discoverAll(weeks)
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const totalScored = results.reduce((sum, r) => sum + r.scored, 0)

    return NextResponse.json({
      discovered: totalDiscovered,
      scored: totalScored,
      topics: results.map((r) => r.topic),
      breakdown: results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    console.error('[SocialListening] Error:', err)
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

/**
 * GET handler so Vercel cron (which sends GET) can also trigger discovery.
 */
export async function GET() {
  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }

  try {
    const results = await discoverAll()
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)

    return NextResponse.json({
      discovered: totalDiscovered,
      topics: results.map((r) => r.topic),
      breakdown: results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
