import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { generateImage, isVesperAvailable } from '@/src/integrations/vesper/client'
import Anthropic from '@anthropic-ai/sdk'

export const dynamic = 'force-dynamic'

/**
 * POST /api/briefing-assistant/generate-asset
 * Body: { source_item_id?, briefing_sections, model?, reference_image_url? }
 * Generates a sacrificial asset using Vesper/Nano Banana and persists the result.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  if (!isVesperAvailable()) {
    return NextResponse.json(
      { error: 'Neither VESPER_API_URL nor GEMINI_API_KEY configured' },
      { status: 503 },
    )
  }

  const db = getSupabase()

  const body = await req.json().catch(() => ({}))
  const {
    source_item_id,
    briefing_sections = {},
    model = 'gemini-nano-banana-2',
    reference_image_url,
  } = body as {
    source_item_id?: string
    briefing_sections?: Record<string, string>
    model?: string
    reference_image_url?: string
  }

  const prompt = await buildGenerationPrompt(briefing_sections, source_item_id, db)

  try {
    const result = await generateImage({
      prompt,
      modelId: model,
      referenceImageUrl: reference_image_url,
      aspectRatio: '4:5',
      resolution: '1K',
    })

    if (db) {
      await db.from('briefing_generated_assets').insert({
        source_item_id: source_item_id ?? null,
        prompt,
        image_url: result.imageUrl,
        status: result.status,
        model,
        briefing_sections,
        vesper_generation_id: result.id,
        error: result.error ?? null,
      })
    }

    return NextResponse.json({
      asset: {
        id: result.id,
        prompt,
        image_url: result.imageUrl,
        status: result.status,
        model,
      },
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}

async function buildGenerationPrompt(
  sections: Record<string, string>,
  sourceItemId: string | undefined | null,
  db: ReturnType<typeof getSupabase>,
): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY

  if (apiKey) {
    try {
      const contextParts: string[] = []
      if (sections.idea) contextParts.push(`Creative idea: ${sections.idea}`)
      if (sections.visual) contextParts.push(`Visual direction: ${sections.visual}`)
      if (sections.audience) contextParts.push(`Target audience: ${sections.audience}`)
      if (sections.product) contextParts.push(`Product: ${sections.product}`)
      if (sections.copyInfo) contextParts.push(`Copy/CTA: ${sections.copyInfo}`)

      let sourceContext = ''
      if (sourceItemId && db) {
        const { data: item } = await db
          .from('briefing_source_items')
          .select('title, body_text, page_name, media_type')
          .eq('id', sourceItemId)
          .single()
        if (item) {
          sourceContext = `\nReference ad: ${item.page_name} — ${item.body_text?.slice(0, 200) ?? ''}`
        }
      }

      const client = new Anthropic({ apiKey })
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 512,
        messages: [{
          role: 'user',
          content: `You are a prompt engineer for AI image generation (Nano Banana / Gemini).
Write a single, detailed image generation prompt for a Loop Earplugs performance ad.

Briefing context:
${contextParts.join('\n')}${sourceContext}

Requirements:
- The prompt should describe a complete ad creative suitable for social media (Meta, TikTok)
- Include style direction, composition, lighting, and mood
- Reference the Loop Earplugs product naturally
- Keep the prompt under 300 words
- Do NOT include any markdown, just the raw prompt text`,
        }],
      })

      const text = response.content.find((b) => b.type === 'text')
      if (text?.type === 'text') return text.text.trim()
    } catch {
      // Fall through to manual prompt construction
    }
  }

  const parts: string[] = [
    'A high-quality performance ad creative for Loop Earplugs.',
  ]
  if (sections.visual) parts.push(sections.visual)
  if (sections.idea) parts.push(`Concept: ${sections.idea}`)
  if (sections.audience) parts.push(`Audience: ${sections.audience}`)
  parts.push('Professional product photography style, clean composition, social media optimised.')
  return parts.join(' ')
}
