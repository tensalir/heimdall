import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * POST /api/feedback/summarize
 * Body: { experiment_id: string }
 * Fetches all feedback entries for the experiment, generates a consolidated AI summary,
 * caches it on feedback_experiments.summary_cache, and returns it.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  let body: { experiment_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const experimentId = body.experiment_id
  if (!experimentId) {
    return NextResponse.json({ error: 'experiment_id is required' }, { status: 400 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: experiment, error: expErr } = await db
    .from('feedback_experiments')
    .select('id, experiment_name, summary_cache')
    .eq('id', experimentId)
    .single()
  if (expErr || !experiment) {
    return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })
  }

  const { data: entries, error: entErr } = await db
    .from('feedback_entries')
    .select('role, author, content')
    .eq('experiment_id', experimentId)
    .order('updated_at', { ascending: false })
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 })
  }

  const parts: string[] = []
  for (const e of entries ?? []) {
    const label = e.role === 'strategy' ? 'Strategy' : e.role === 'design' ? 'Design' : 'Copy'
    const by = e.author ? ` (${e.author})` : ''
    if (e.content?.trim()) {
      parts.push(`## ${label}${by}\n${e.content.trim()}`)
    }
  }
  const feedbackBlock = parts.length ? parts.join('\n\n') : '(No feedback yet.)'

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      thinking: { type: 'enabled', budget_tokens: 2000 },
      messages: [
        {
          role: 'user',
          content: `You are summarizing consolidated stakeholder feedback for an experiment so it can be sent to Monday and shared with the team.

Experiment: "${experiment.experiment_name}"

Feedback from Strategy, Design, and Copy roles:

${feedbackBlock}

Produce a single short summary (2-4 sentences) that:
- States the main actionable points and decisions.
- Is clear for someone who did not read the full feedback.
- Avoids bullet points and markdown; use plain prose.`,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const summary = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    if (summary && db) {
      await db
        .from('feedback_experiments')
        .update({ summary_cache: summary, updated_at: new Date().toISOString() })
        .eq('id', experimentId)
    }

    return NextResponse.json({ summary, experiment_id: experimentId })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
