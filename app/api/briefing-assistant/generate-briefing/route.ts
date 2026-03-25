import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { WorkingDocSectionsSchema } from '@/src/domain/briefingAssistant/schema'
import { getEvidence } from '@/src/domain/briefingAssistant/sources'
import { validateDatasourceIds } from '@/src/domain/briefingAssistant/datasources'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const SECTION_KEYS = [
  'idea',
  'why',
  'audience',
  'product',
  'visual',
  'copyInfo',
  'test',
  'variants',
] as const

/**
 * POST /api/briefing-assistant/generate-briefing
 * Body: { assignmentId, briefName, productOrUseCase, format, funnel, agencyRef, assetCount, sourceIds? }
 * When sourceIds are provided, fetches evidence and injects it into the prompt for data-informed sections.
 * Returns: { sections, evidenceRefs? } for creative validation.
 */
export async function POST(req: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'ANTHROPIC_API_KEY not configured' },
      { status: 503 }
    )
  }

  let body: {
    assignmentId?: string
    briefName?: string
    productOrUseCase?: string
    format?: string
    funnel?: string
    agencyRef?: string
    assetCount?: number
    sourceIds?: string[]
    /** UUIDs of briefing_source_items — primary evidence for Create Briefing flow */
    sourceItemIds?: string[]
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const {
    briefName = 'Untitled',
    productOrUseCase = '',
    format = 'static',
    funnel = 'tof',
    agencyRef = '',
    assetCount = 4,
    sourceIds: rawSourceIds,
    sourceItemIds: rawSourceItemIds,
  } = body

  const validSourceIds = validateDatasourceIds(rawSourceIds ?? [])
  const evidence = validSourceIds.length > 0
    ? await getEvidence(validSourceIds, { productOrUseCase, limit: 20 })
    : []

  const itemEvidence = await fetchSourceItemEvidence(
    Array.isArray(rawSourceItemIds) ? rawSourceItemIds : [],
  )

  const evidenceParts: string[] = []
  if (evidence.length > 0) {
    evidenceParts.push(
      `Evidence from data sources (use to ground your sections where relevant):\n${evidence
        .map((e, i) => `[${i + 1}] (id: ${e.id}) ${e.text}${e.recency ? ` (${e.recency})` : ''}`)
        .join('\n')}`,
    )
  }
  if (itemEvidence.lines.length > 0) {
    const offset = evidence.length
    evidenceParts.push(
      `Evidence from selected source items (ads, trends, comments, etc.):\n${itemEvidence.lines
        .map((line, i) => `[${offset + i + 1}] ${line}`)
        .join('\n')}`,
    )
  }
  const evidenceBlock =
    evidenceParts.length > 0 ? `\n\n${evidenceParts.join('\n\n')}\n` : ''

  const prompt = `You are a creative strategist writing a creative briefing for Loop Earplugs. Generate content for a briefing document based on the following metadata.
${evidenceBlock}

Assignment metadata:
- Brief name: ${briefName}
- Product / use case: ${productOrUseCase || '(not specified)'}
- Format: ${format}
- Funnel stage: ${funnel} (tof = top of funnel, bof = bottom of funnel, retention)
- Agency: ${agencyRef || '(not specified)'}
- Number of assets: ${assetCount}

Produce a JSON object with exactly these keys, each with 1-3 sentences of concise, actionable content suitable for a creative brief. Use plain text, no markdown. Where the evidence above supports a section, draw on it.
- idea: The core creative idea or concept
- why: Why this idea matters / strategic rationale
- audience: Target audience description
- product: Product context and positioning
- visual: Visual direction and style notes
- copyInfo: Copy tone, key messages, CTAs
- test: What we're testing or learning
- variants: Any variant considerations (A/B, formats, etc.)

Return ONLY valid JSON in this exact shape:
{"idea":"...","why":"...","audience":"...","product":"...","visual":"...","copyInfo":"...","test":"...","variants":"..."}`

  try {
    const client = new Anthropic({ apiKey })
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : ''
    if (!rawText) {
      return NextResponse.json(
        { error: 'No content returned from AI' },
        { status: 502 }
      )
    }

    // Extract JSON from potential markdown code blocks
    let jsonStr = rawText
    const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1].trim()
    }

    const parsed = JSON.parse(jsonStr) as Record<string, string>
    const sections: Record<string, string> = {}
    for (const key of SECTION_KEYS) {
      const val = parsed[key]
      if (typeof val === 'string' && val.trim()) {
        sections[key] = val.trim()
      }
    }

    const validated = WorkingDocSectionsSchema.safeParse(sections)
    if (!validated.success) {
      return NextResponse.json(
        { error: 'Invalid sections structure', details: validated.error.flatten() },
        { status: 502 }
      )
    }

    const evidenceRefs = [
      ...evidence.map((e) => ({ id: e.id, source: e.source, recency: e.recency })),
      ...itemEvidence.refs,
    ]
    return NextResponse.json({
      sections: validated.data,
      evidenceRefs: evidenceRefs.length > 0 ? evidenceRefs : undefined,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

async function fetchSourceItemEvidence(ids: string[]): Promise<{
  lines: string[]
  refs: Array<{ id: string; source: string; recency?: string }>
}> {
  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && UUID_RE.test(id)))]
  if (unique.length === 0) return { lines: [], refs: [] }

  const db = getSupabase()
  if (!db) return { lines: [], refs: [] }

  const { data, error } = await db
    .from('briefing_source_items')
    .select('id, source_type, title, preview, body_text, raw_data')
    .in('id', unique)

  if (error || !data?.length) return { lines: [], refs: [] }

  const lines: string[] = []
  const refs: Array<{ id: string; source: string; recency?: string }> = []

  for (const row of data as Array<Record<string, unknown>>) {
    const id = String(row.id)
    const sourceType = String(row.source_type ?? 'unknown')
    const title = String(row.title ?? '')
    const preview = row.preview != null ? String(row.preview) : ''
    const body = row.body_text != null ? String(row.body_text) : ''
    const raw = row.raw_data && typeof row.raw_data === 'object' ? (row.raw_data as Record<string, unknown>) : {}
    const product = raw.product != null ? String(raw.product) : ''
    const mediaType = raw.media_type != null ? String(raw.media_type) : ''

    const textParts = [title && `Title: ${title}`, preview && `Preview: ${preview}`, body && `Body: ${body}`]
      .filter(Boolean)
      .join('\n')
    const meta = [product && `product: ${product}`, mediaType && `media: ${mediaType}`]
      .filter(Boolean)
      .join('; ')

    lines.push(
      `(source_item id: ${id}, type: ${sourceType}${meta ? `, ${meta}` : ''})\n${textParts || '(no text)'}`,
    )
    refs.push({ id, source: `source_item:${sourceType}` })
  }

  return { lines, refs }
}
