import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { getEvidence } from '@/src/domain/briefingAssistant/sources'
import { validateDatasourceIds } from '@/src/domain/briefingAssistant/datasources'
import { MIMIR_TEXT_MODEL, MIMIR_BRIEFING_MAX_TOKENS } from '@/src/domain/briefingAssistant/models'
import { requireUser } from '@/lib/route-auth'
import type { AngleGenerationResult } from '@/src/domain/briefingAssistant/angleContext'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const BodySchema = z.object({
  assignmentId: z.string(),
  productOrUseCase: z.string(),
  ideationStarter: z.string().optional(),
  sourceIds: z.array(z.string()).optional(),
  limit: z.number().int().min(1).max(50).optional(),
})

/** Build evidence block for prompt (id + text so model can cite by id). */
function formatEvidenceBlock(evidence: { id: string; text: string; recency?: string }[]): string {
  if (evidence.length === 0) return ''
  return evidence
    .map((e) => `[${e.id}] ${e.text}${e.recency ? ` (${e.recency})` : ''}`)
    .join('\n')
}

/**
 * POST /api/briefing-assistant/angles
 * Body: { assignmentId, productOrUseCase, ideationStarter?, sourceIds?, limit? }
 * sourceIds must be canonical datasource IDs. Fetches evidence and generates angles via LLM with dataRefs.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  try {
    const body = await req.json()
    const parsed = BodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid input', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const { assignmentId, productOrUseCase, ideationStarter, sourceIds, limit } = parsed.data
    const validSourceIds = validateDatasourceIds(sourceIds ?? [])
    if (validSourceIds.length === 0) {
      return NextResponse.json(
        { error: 'At least one valid sourceId required (ad_performance, social_comments, untapped_use_cases, or static_fallback)' },
        { status: 400 }
      )
    }
    const evidence = await getEvidence(validSourceIds, { productOrUseCase, limit: limit ?? 15 })
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (apiKey && evidence.length > 0) {
      const evidenceBlock = formatEvidenceBlock(evidence)
      const systemPrompt = `You are a creative strategist generating campaign angles for Loop Earplugs. Use the evidence below to create data-informed angles. Each angle must cite at least one evidence id in dataRefs (use the exact id string in square brackets).`
      const userPrompt = `Product/use case: ${productOrUseCase}
${ideationStarter ? `Ideation starter: ${ideationStarter}\n` : ''}

Evidence:
${evidenceBlock}

Generate 3–5 distinct angles. Return ONLY valid JSON array:
[{"title":"...","hook":"...","humanInsight":"...","confidenceLevel":"high|medium|low","dataRefs":["evidence-id-1",...]}, ...]
Each dataRefs array must contain ids from the evidence list above.`

      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: MIMIR_TEXT_MODEL,
        max_tokens: MIMIR_BRIEFING_MAX_TOKENS,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      })
      const textBlock = response.content.find((b) => b.type === 'text')
      const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : ''
      if (rawText) {
        let jsonStr = rawText
        const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeMatch) jsonStr = codeMatch[1].trim()
        try {
          const parsedAngles = JSON.parse(jsonStr) as Array<{
            title?: string
            hook?: string
            humanInsight?: string
            confidenceLevel?: string
            dataRefs?: string[]
          }>
          if (Array.isArray(parsedAngles) && parsedAngles.length > 0) {
            const angles: AngleGenerationResult['angles'] = parsedAngles.map((a) => ({
              title: String(a.title ?? 'Angle'),
              hook: String(a.hook ?? ''),
              humanInsight: String(a.humanInsight ?? ''),
              confidenceLevel: (a.confidenceLevel === 'high' || a.confidenceLevel === 'medium' || a.confidenceLevel === 'low' ? a.confidenceLevel : 'medium') as 'high' | 'medium' | 'low',
              dataRefs: Array.isArray(a.dataRefs) ? a.dataRefs : [],
              combination: productOrUseCase,
            }))
            return NextResponse.json({ angles })
          }
        } catch {
          // fall through to placeholder
        }
      }
    }
    const angles: AngleGenerationResult['angles'] = [
      {
        title: `${productOrUseCase} — angle 1`,
        hook: ideationStarter ?? evidence[0]?.text ?? 'Lead with benefit over feature.',
        humanInsight: evidence[0]?.text ?? 'Use evidence from sources to shape the angle.',
        confidenceLevel: evidence.length > 0 ? 'high' : 'medium',
        dataRefs: evidence.slice(0, 3).map((e) => e.id),
        combination: productOrUseCase,
      },
    ]
    return NextResponse.json({ angles })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Angle generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
