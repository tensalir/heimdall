import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/workflows
 * Returns recent workflow runs.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ runs: [] })
  }

  const { data, error } = await db
    .from('briefing_workflow_runs')
    .select('id, workflow_id, workflow_name, status, started_at, completed_at, output_count, error')
    .order('started_at', { ascending: false })
    .limit(50)

  if (error) {
    return NextResponse.json({ runs: [] })
  }

  return NextResponse.json({ runs: data ?? [] })
}

/**
 * POST /api/briefing-assistant/workflows
 * Start a new workflow run. Body: { workflow_id }
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const workflowId = (body as { workflow_id?: string }).workflow_id?.trim()
  if (!workflowId) {
    return NextResponse.json({ error: 'workflow_id required' }, { status: 400 })
  }

  const WORKFLOW_NAMES: Record<string, string> = {
    'trend-mining': 'Trend Mining',
    'angle-discovery': 'Cross-Source Angle Discovery',
    'report-synthesis': 'Briefing Input Report',
  }

  const workflowName = WORKFLOW_NAMES[workflowId] ?? workflowId

  const { data: run, error } = await db
    .from('briefing_workflow_runs')
    .insert({
      workflow_id: workflowId,
      workflow_name: workflowName,
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id, workflow_id, workflow_name, status, started_at')
    .single()

  if (error || !run) {
    return NextResponse.json({ error: error?.message ?? 'Failed to start' }, { status: 500 })
  }

  runWorkflowAsync(db, run.id, workflowId).catch(console.error)

  return NextResponse.json({ run })
}

async function runWorkflowAsync(
  db: ReturnType<typeof getSupabase>,
  runId: string,
  workflowId: string,
) {
  if (!db) return
  try {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      await db.from('briefing_workflow_runs').update({
        status: 'failed',
        error: 'ANTHROPIC_API_KEY not configured',
        completed_at: new Date().toISOString(),
      }).eq('id', runId)
      return
    }

    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const client = new Anthropic({ apiKey })

    const systemPrompts: Record<string, string> = {
      'trend-mining': 'You are a creative trends researcher for Loop Earplugs. Generate 5 emerging creative trends relevant to earplug/audio accessory advertising. For each trend: title, description (2-3 sentences), platform source, and relevance score (0-100). Return JSON array.',
      'angle-discovery': 'You are a creative strategist for Loop Earplugs. Discover 5 new creative angles by combining ad performance data, social sentiment, and cultural trends. For each: title, description, hook suggestion, and confidence level (high/medium/low). Return JSON array.',
      'report-synthesis': 'You are a briefing strategist for Loop Earplugs. Synthesise a brief research report covering: top performing ad themes, audience sentiment insights, emerging opportunities. Return as JSON with sections: executive_summary, ad_themes (array), sentiment_insights (array), opportunities (array).',
    }

    const prompt = systemPrompts[workflowId] ?? systemPrompts['angle-discovery']

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })

    const text = response.content.find((b) => b.type === 'text')
    const rawText = text?.type === 'text' ? text.text.trim() : ''

    let outputCount = 0
    if (rawText) {
      let parsed: unknown
      try {
        let jsonStr = rawText
        const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeMatch) jsonStr = codeMatch[1].trim()
        parsed = JSON.parse(jsonStr)
      } catch {
        parsed = null
      }

      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          const obj = item as Record<string, unknown>
          await db.from('briefing_source_items').insert({
            source_type: 'workflow_output',
            title: (obj.title as string) ?? 'Workflow output',
            preview: (obj.description as string) ?? JSON.stringify(obj).slice(0, 300),
            platform: 'workflow',
            tags: [],
            raw_data: obj,
          })
          outputCount++
        }
      } else if (parsed && typeof parsed === 'object') {
        await db.from('briefing_source_items').insert({
          source_type: 'workflow_output',
          title: `${workflowId} report`,
          preview: (parsed as Record<string, unknown>).executive_summary as string ?? rawText.slice(0, 300),
          platform: 'workflow',
          tags: [],
          raw_data: parsed as Record<string, unknown>,
        })
        outputCount = 1
      }
    }

    await db.from('briefing_workflow_runs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      output_count: outputCount,
    }).eq('id', runId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error'
    await db.from('briefing_workflow_runs').update({
      status: 'failed',
      error: msg,
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
  }
}
