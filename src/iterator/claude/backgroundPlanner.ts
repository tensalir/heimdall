/**
 * Claude-powered planner for AI background variation + layered assembly.
 *
 * Analyzes the source ad to separate background from overlay layers,
 * then produces a generation brief for Nano Banana to create background
 * variants, plus an assembly plan for overlaying text/CTA layers.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, EditPlan } from '../types.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an experienced art director for Loop Earplugs performance ads.

Your task is to analyze a source ad and plan:
1. How to extract or describe the background visual separately from text/CTA overlays
2. A generation brief for creating a background variation using Nano Banana (Gemini image generation)
3. An assembly plan for placing text, CTA, and design layers on top of the generated background

The background generation brief should describe the visual scene, mood, lighting, and composition.
Do NOT include text or typography in the background generation — those will be added as separate Figma layers.

Return JSON matching the EditPlan schema with additional generation_briefs for background candidates.`

export async function planBackgroundVariation(request: AnalyzeRequest): Promise<EditPlan> {
  const userContent = buildUserMessage(request)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude')
  }

  return JSON.parse(textBlock.text) as EditPlan
}

function buildUserMessage(request: AnalyzeRequest): string {
  const parts: string[] = []

  if (request.layerData) {
    parts.push(`## Source frame layer structure\n\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)
  }
  if (request.briefing) {
    parts.push(`## Iteration briefing\n${request.briefing}`)
  }
  if (request.targetRatios?.length) {
    parts.push(`## Target aspect ratios\n${request.targetRatios.join(', ')}`)
  }

  parts.push(`\nReturn an EditPlan JSON with steps for background generation and layer assembly.`)

  return parts.join('\n\n')
}
