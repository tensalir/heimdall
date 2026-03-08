import { NextRequest, NextResponse } from 'next/server'
import { mondayGraphql } from '@/src/integrations/monday/client'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? ''
const DOC_COLUMN_ID = process.env.MONDAY_FEEDBACK_DOC_COLUMN_ID ?? ''
const SUMMARY_COLUMN_ID = process.env.MONDAY_FEEDBACK_SUMMARY_COLUMN_ID ?? ''

function buildDocMarkdown(experimentName: string, summary: string, entries: Array<{ role: string; author: string; content: string }>): string {
  const sections: string[] = [
    `# ${experimentName}`,
    '',
    `*Consolidated feedback — ${new Date().toISOString().slice(0, 10)}*`,
    '',
    '## Summary',
    '',
    summary || '(No summary generated.)',
    '',
  ]
  const byRole = { strategy: 'Strategy Feedback', design: 'Design Feedback', copy: 'Copy Feedback' }
  for (const role of ['strategy', 'design', 'copy']) {
    const label = byRole[role as keyof typeof byRole]
    const list = entries.filter((e) => e.role === role && e.content?.trim())
    sections.push(`## ${label}`, '')
    if (list.length) {
      for (const e of list) {
        const by = e.author ? ` *(${e.author})*` : ''
        sections.push(`-${by}\n${e.content.trim()}`, '')
      }
    } else {
      sections.push('*(No feedback.)*', '')
    }
    sections.push('')
  }
  return sections.join('\n')
}

/**
 * POST /api/feedback/send-to-monday
 * Body: { experiment_id: string }
 * Fetches experiment + entries, ensures summary, creates/updates Monday Doc and optionally writes summary to a column.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }
  if (!BOARD_ID) {
    return NextResponse.json({ error: 'MONDAY_BOARD_ID not configured' }, { status: 500 })
  }

  let body: { experiment_id?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const experimentId = body.experiment_id
  if (!experimentId) {
    return NextResponse.json({ error: 'experiment_id is required' }, { status: 400 })
  }

  const { data: experiment, error: expErr } = await db
    .from('feedback_experiments')
    .select('id, round_id, monday_item_id, experiment_name, summary_cache')
    .eq('id', experimentId)
    .single()
  if (expErr || !experiment) {
    return NextResponse.json({ error: 'Experiment not found' }, { status: 404 })
  }

  const { data: entries, error: entErr } = await db
    .from('feedback_entries')
    .select('role, author, content')
    .eq('experiment_id', experimentId)
  if (entErr) {
    return NextResponse.json({ error: entErr.message }, { status: 500 })
  }

  let summary = experiment.summary_cache
  if (!summary?.trim()) {
    const summarizeRes = await fetch(new URL('/api/feedback/summarize', req.url).toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ experiment_id: experimentId }),
    })
    if (!summarizeRes.ok) {
      const err = await summarizeRes.json().catch(() => ({}))
      return NextResponse.json({ error: err.error ?? 'Failed to generate summary' }, { status: 502 })
    }
    const sumData = await summarizeRes.json()
    summary = sumData.summary ?? ''
  }

  const itemId = experiment.monday_item_id
  const docContent = buildDocMarkdown(
    experiment.experiment_name,
    summary,
    (entries ?? []).map((e) => ({ role: e.role, author: e.author ?? '', content: e.content ?? '' }))
  )

  if (DOC_COLUMN_ID) {
    const createDoc = await mondayGraphql<{ create_doc?: { id: string } }>(
      `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $title: String!, $content: String!) {
        create_doc(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          title: $title
          content: $content
        ) {
          id
        }
      }`,
      {
        boardId: BOARD_ID,
        itemId,
        columnId: DOC_COLUMN_ID,
        title: `Feedback: ${experiment.experiment_name}`,
        content: docContent,
      }
    )
    if (!createDoc?.create_doc?.id) {
      return NextResponse.json(
        { error: 'Monday API: failed to create doc. Check MONDAY_FEEDBACK_DOC_COLUMN_ID and docs:write scope.' },
        { status: 502 }
      )
    }
  }

  if (SUMMARY_COLUMN_ID && summary) {
    const changeCol = await mondayGraphql<{ change_simple_column_value?: { id: string } }>(
      `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $value: String!) {
        change_simple_column_value(
          board_id: $boardId
          item_id: $itemId
          column_id: $columnId
          value: $value
        ) {
          id
        }
      }`,
      {
        boardId: BOARD_ID,
        itemId,
        columnId: SUMMARY_COLUMN_ID,
        value: summary,
      }
    )
    if (!changeCol?.change_simple_column_value) {
      // Non-fatal: doc may have been created
    }
  }

  const now = new Date().toISOString()
  await db
    .from('feedback_experiments')
    .update({ sent_to_monday: true, sent_at: now, updated_at: now })
    .eq('id', experimentId)

  return NextResponse.json({
    ok: true,
    experiment_id: experimentId,
    monday_item_id: itemId,
    sent_at: now,
    doc_created: !!DOC_COLUMN_ID,
  })
}
