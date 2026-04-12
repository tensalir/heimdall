/**
 * Claude-powered planner for layered iteration.
 *
 * Analyzes the source frame's layer structure, the briefing context,
 * and optional historical references, then returns a structured edit plan
 * that the plugin can apply as Figma layer mutations.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, EditPlan } from '../types.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are an experienced art director and performance-ad designer for Loop Earplugs.

You are analyzing a Figma frame to plan layered edits — copy changes, element repositioning, hierarchy adjustments, or new layer additions.

Your output must be a JSON edit plan that the Iterator plugin can apply programmatically. Each step specifies an action, a target node, parameters, and a rationale.

Design principles:
- Preserve or improve visual hierarchy. The primary message should read first.
- Maintain brand consistency. Loop uses Avantt and FK Screamer typefaces.
- Respect safe zones. Content must stay within platform-specific margins.
- Prefer intentional composition over mechanical rearrangement.
- If a change would make the ad weaker, say so and suggest an alternative.

Story preservation:
- The background image carries part of the ad's meaning. Identify what narrative it tells (person commuting, product in use, lifestyle scene).
- Identify story-carrying regions: faces, gaze, hands, gestures, product interaction, environmental cues.
- If any overlay would obscure these regions after resizing, recommend moving it to a less narrative-critical area.
- Include a "storyPreservation" field in your output with: storySubject, protectedRegions, occlusionRisk (low/medium/high), recommendedAdjustment (none/move_up/move_down/move_left/move_right/shrink_overlay/reformat_overlay), and rationale.`

export async function planLayeredIteration(request: AnalyzeRequest): Promise<EditPlan> {
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

  const parsed = JSON.parse(textBlock.text)
  return parsed as EditPlan
}

function buildUserMessage(request: AnalyzeRequest): string {
  const parts: string[] = []

  if (request.layerData) {
    parts.push(`## Source frame layer structure\n\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)
  }

  if (request.briefing) {
    parts.push(`## Briefing / iteration request\n${request.briefing}`)
  }

  if (request.targetRatios?.length) {
    parts.push(`## Target ratios\n${request.targetRatios.join(', ')}`)
  }

  parts.push(`\nReturn a JSON edit plan following this shape:\n{ "mode": "layered-iteration", "sourceDescription": "...", "steps": [...], "targetRatios": [...], "confidence": "high|medium|low", "humanReviewNeeded": boolean, "reasoning": "...", "storyPreservation": { "storySubject": "...", "protectedRegions": [...], "occlusionRisk": "low|medium|high", "recommendedAdjustment": "none|move_up|move_down|...", "rationale": "..." } }`)

  return parts.join('\n\n')
}
