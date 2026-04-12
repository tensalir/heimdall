/**
 * Claude-powered planner for briefing-to-new-ad.
 *
 * Analyzes a creative brief and historical reference set, produces a
 * frame spec and chooses the best output path (layered, bg+layers, or flat).
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, EditPlan } from '../types.js'
import { extractJson } from './skillLoader.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an experienced creative director for Loop Earplugs.

You are creating a new performance ad from a creative briefing. Your task:

1. Analyze the briefing and any provided reference frames
2. Choose a composition archetype (hero image + overlay, split layout, product grid, editorial, meme/cultural, timer/UI sim)
3. Define a visual system (palette, typography, spacing, mood)
4. Choose the best output path:
   - "layered-iteration": deterministic Figma composition (best for exact control)
   - "ai-bg-plus-layers": AI-generated background + Figma text layers (best bridge)
   - "flat-ai-variants": full AI generation (best for ideation velocity)
5. Produce either an edit plan (layered) or generation briefs (AI paths)

Return JSON matching the EditPlan schema.

Story preservation:
- If the concept involves lifestyle or person-centric imagery, identify which regions carry the narrative.
- Plan overlay placement that supports the story rather than obscuring the subject.
- Include a "storyPreservation" field: storySubject, protectedRegions, occlusionRisk, recommendedAdjustment, rationale.

Use adaptive thinking to reason through the creative direction before committing.`

export async function planFromBriefing(request: AnalyzeRequest): Promise<EditPlan> {
  const userContent = buildUserMessage(request)

  const response = await client.messages.create({
    model: 'claude-opus-4-6',
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

  if (request.briefing) {
    parts.push(`## Creative Briefing\n${request.briefing}`)
  }
  if (request.layerData) {
    parts.push(`## Reference frame data\n\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)
  }
  if (request.targetRatios?.length) {
    parts.push(`## Required aspect ratios\n${request.targetRatios.join(', ')}`)
  }

  parts.push(`\nAnalyze the briefing, choose a composition archetype and output path, then return an EditPlan JSON.`)

  return parts.join('\n\n')
}
