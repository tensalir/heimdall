import { NextRequest, NextResponse } from 'next/server'
import {
  discoverAndProcess,
  discoverAll,
  getVertical,
  VERTICALS,
} from '@/src/services/trendDiscoveryService'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/briefing-assistant/trends/discover
 * Body: { vertical?: string }
 * Triggers trend discovery for a single vertical or all verticals.
 * Also accepts empty body / no body to discover all.
 * Works as a Vercel cron target (POST with no body = discover all).
 */
export async function POST(req: NextRequest) {
  if (!process.env.EXA_API_KEY) {
    return NextResponse.json({ error: 'EXA_API_KEY not configured' }, { status: 503 })
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const body = await req.json().catch(() => ({}))
  const { vertical } = body as { vertical?: string }

  try {
    if (vertical) {
      if (!getVertical(vertical)) {
        return NextResponse.json(
          {
            error: `Unknown vertical: ${vertical}`,
            available: VERTICALS.map((v) => v.id),
          },
          { status: 400 },
        )
      }

      const result = await discoverAndProcess(vertical)
      return NextResponse.json({
        discovered: result.discovered,
        scored: result.scored,
        digest: result.digest,
        verticals: [vertical],
      })
    }

    const results = await discoverAll()
    const totalDiscovered = results.reduce((sum, r) => sum + r.discovered, 0)
    const totalScored = results.reduce((sum, r) => sum + r.scored, 0)

    return NextResponse.json({
      discovered: totalDiscovered,
      scored: totalScored,
      verticals: results.map((r) => r.vertical),
      breakdown: results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    console.error('[TrendDiscover] Error:', err)
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
      verticals: results.map((r) => r.vertical),
      breakdown: results,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Discovery failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
