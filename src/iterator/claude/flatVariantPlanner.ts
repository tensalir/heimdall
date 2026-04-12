/**
 * Claude-powered planner for flat AI-composed variants.
 *
 * Analyzes reference ads and constraints, then produces model-specific
 * prompt packs for Nano Banana to generate complete 4:5 and 9:16 outputs.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, EditPlan } from '../types.js'
import { extractJson } from './skillLoader.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an experienced art director and prompt engineer for Loop Earplugs performance ads.

Your task is to create Nano Banana (Gemini image generation) prompt packs that will produce complete, flat ad images.

Each prompt should describe:
- The full visual scene, composition, and mood
- Product placement and prominence
- Text content including headline, subtext, and CTA (specify exact copy)
- Typography style: use Avantt (Medium or SemiBold) for headlines, FK Screamer for accent text
- Color palette aligned with the product line
- Layout and hierarchy

Generate at least 2 prompt variants per concept. Each prompt should specify an aspect ratio (4:5 or 9:16).

Important: Nano Banana generates flat images, not layered compositions. The text will be rendered INTO the image.
Font fidelity is approximate — for exact brand fonts, the layered assembly path is preferred.

Return JSON matching the EditPlan schema with generation_briefs for each variant.`

export async function planFlatVariants(request: AnalyzeRequest): Promise<EditPlan> {
  const userContent = buildUserMessage(request)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return JSON.parse(extractJson(textBlock.text)) as EditPlan
}

function buildUserMessage(request: AnalyzeRequest): string {
  const parts: string[] = []

  if (request.layerData) {
    parts.push(`## Reference ad structure\n\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)
  }
  if (request.briefing) {
    parts.push(`## Creative briefing\n${request.briefing}`)
  }
  if (request.targetRatios?.length) {
    parts.push(`## Required aspect ratios\n${request.targetRatios.join(', ')}`)
  }

  parts.push(`\nReturn an EditPlan JSON with generation_briefs for flat image variants.`)

  return parts.join('\n\n')
}
