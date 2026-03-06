import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '@/lib/supabase'
import {
  buildScoringPrompt,
  computeOverallScore,
  RUBRIC_VERSION,
} from '@/src/domain/briefingAssistant/scoring/rubric'

export const dynamic = 'force-dynamic'

/**
 * POST /api/briefing-assistant/analysis
 * Body: { source_item_id } or { ad_description }
 * Runs AI creative analysis and persists scores.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 503 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const body = await req.json().catch(() => ({}))
  const { source_item_id, ad_description: rawDesc } = body as {
    source_item_id?: string
    ad_description?: string
  }

  let adDescription = rawDesc?.trim() ?? ''
  let itemId: string | null = source_item_id ?? null

  if (itemId) {
    const { data: item } = await db
      .from('briefing_source_items')
      .select('title, body_text, page_name, media_type, platform, tags')
      .eq('id', itemId)
      .single()

    if (!item) {
      return NextResponse.json({ error: 'Source item not found' }, { status: 404 })
    }

    const parts: string[] = []
    if (item.page_name) parts.push(`Brand: ${item.page_name}`)
    if (item.platform) parts.push(`Platform: ${item.platform}`)
    if (item.media_type) parts.push(`Format: ${item.media_type}`)
    if (item.body_text) parts.push(`Ad copy: ${item.body_text}`)
    if (item.tags?.length) parts.push(`Tags: ${item.tags.join(', ')}`)
    adDescription = parts.join('\n')
  }

  if (!adDescription) {
    return NextResponse.json(
      { error: 'Provide source_item_id or ad_description' },
      { status: 400 },
    )
  }

  const prompt = buildScoringPrompt(adDescription)

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : ''

    let jsonStr = rawText
    const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeMatch) jsonStr = codeMatch[1].trim()

    const parsed = JSON.parse(jsonStr) as {
      hook?: number
      attention?: number
      clarity?: number
      cta?: number
      summary?: string
    }

    const scores = {
      hook: clampScore(parsed.hook),
      attention: clampScore(parsed.attention),
      clarity: clampScore(parsed.clarity),
      cta: clampScore(parsed.cta),
    }
    const overall = computeOverallScore(scores)
    const summary = parsed.summary ?? null

    if (itemId) {
      await db.from('briefing_analysis_scores').upsert(
        {
          source_item_id: itemId,
          score_hook: scores.hook,
          score_attention: scores.attention,
          score_clarity: scores.clarity,
          score_cta: scores.cta,
          score_overall: overall,
          analysis_summary: summary,
          rubric_version: RUBRIC_VERSION,
          model_used: 'claude-sonnet-4-20250514',
          raw_response: parsed,
        },
        { onConflict: 'source_item_id,rubric_version' },
      )
    }

    return NextResponse.json({
      scores: { ...scores, overall },
      summary,
      rubric_version: RUBRIC_VERSION,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Analysis failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

function clampScore(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (isNaN(n)) return 50
  return Math.max(0, Math.min(100, Math.round(n)))
}
