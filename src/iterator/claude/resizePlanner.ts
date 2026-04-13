/**
 * Claude-powered planner for aspect-ratio resize / format derivation.
 *
 * Given a source frame's layer structure (from the ORIGINAL master, not a
 * resized clone) and a target aspect ratio, produces an EditPlan with
 * move/scale/reflow/crop-shift steps that adapt the layout while
 * preserving visual hierarchy and story.
 *
 * The plugin applies a recursive proportional baseline FIRST, then
 * overlays this plan's steps for art-directed refinement.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { EditPlan } from '../types.js'
import { extractJson } from './skillLoader.js'

const client = new Anthropic()

const CANONICAL_SIZES: Record<string, { w: number; h: number }> = {
  '9x16': { w: 1440, h: 2560 },
  '4x5': { w: 1440, h: 1800 },
  '1x1': { w: 1440, h: 1440 },
}

const SAFE_ZONES: Record<string, { top: number; bottom: number; side: number }> = {
  '9x16': { top: 240, bottom: 492, side: 80 },
  '4x5': { top: 180, bottom: 180, side: 80 },
  '1x1': { top: 144, bottom: 144, side: 80 },
}

const SYSTEM_PROMPT = `You are an experienced art director adapting performance ads from one aspect ratio to another for Loop Earplugs.

IMPORTANT CONTEXT:
- The plugin has already applied a proportional baseline: all elements have been scaled and repositioned proportionally from the source to the target frame.
- Your job is to produce ART-DIRECTED REFINEMENTS on top of that baseline — fixing things that proportional scaling gets wrong, like cramped spacing, hierarchy loss, or story occlusion.
- You do NOT need to move every element. Only include steps for elements that need art-directed adjustment beyond what proportional scaling already did.
- Each step uses the TARGET coordinate space (the element is already at its proportionally-scaled position).

Available actions per step:
- "move": { dx, dy } or { x, y } — nudge or reposition an element
- "scale": { factor } or { factorX, factorY } — resize an element
- "reflow": { maxWidth, fontSize? } — reflow text to fit width
- "crop-shift": { zoom, panX, panY } — adjust crop/pan on an image rectangle

Design principles:
- Preserve visual hierarchy. The primary message should read first.
- Respect safe zones. All content must stay within the safe zone for the target format.
- Background images should remain full-bleed; use crop-shift if the subject gets cut.
- For severe compressions (>45% height loss), text may need to shrink and groups may need to restructure.
- For mild compressions (<30%), small nudges may be all that's needed.

Story preservation:
- The background image carries part of the ad's meaning.
- If overlays would cover story-carrying regions after resize, move them to less narrative-critical areas.
- Include a "storyPreservation" field in your output.

Return ONLY a JSON object in this shape:
{
  "mode": "layered-iteration",
  "sourceDescription": "brief description of the ad",
  "steps": [
    { "action": "move|scale|reflow|crop-shift", "targetNodeName": "node name", "targetNodeId": "node id if known", "params": { ... }, "rationale": "why" }
  ],
  "targetRatios": ["target ratio"],
  "confidence": "high|medium|low",
  "humanReviewNeeded": boolean,
  "reasoning": "overall approach — what the proportional baseline got right and what you refined",
  "storyPreservation": {
    "storySubject": "what the background shows",
    "protectedRegions": ["face", "gesture", ...],
    "occlusionRisk": "low|medium|high",
    "recommendedAdjustment": "none|move_up|move_down|...",
    "rationale": "why"
  }
}

If the proportional baseline is sufficient and no art-directed changes are needed, return an empty steps array with "reasoning" explaining why.`

export interface ResizePlanRequest {
  layerData: Record<string, unknown>
  sourceRatio: string | null
  targetRatio: string
  sourceWidth: number
  sourceHeight: number
}

export async function planResize(request: ResizePlanRequest): Promise<EditPlan> {
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

  const parsed = JSON.parse(extractJson(textBlock.text))
  return parsed as EditPlan
}

function buildUserMessage(request: ResizePlanRequest): string {
  const target = CANONICAL_SIZES[request.targetRatio]
  const targetSafe = SAFE_ZONES[request.targetRatio]
  const sourceSafe = request.sourceRatio ? SAFE_ZONES[request.sourceRatio] : null

  const heightDelta = target
    ? Math.round((1 - target.h / request.sourceHeight) * 100)
    : 0
  const severity = Math.abs(heightDelta) > 45 ? 'severe' : Math.abs(heightDelta) > 30 ? 'moderate' : 'mild'

  const scaleX = target ? (target.w / request.sourceWidth).toFixed(3) : '?'
  const scaleY = target ? (target.h / request.sourceHeight).toFixed(3) : '?'

  const parts: string[] = []

  parts.push(`## Master frame (${request.sourceWidth}×${request.sourceHeight}, ${request.sourceRatio || 'unknown'})`)
  if (sourceSafe) {
    parts.push(`Source safe zone: top ${sourceSafe.top}px, bottom ${sourceSafe.bottom}px, sides ${sourceSafe.side}px`)
  }

  parts.push(`\n## Target: ${request.targetRatio} (${target?.w || '?'}×${target?.h || '?'})`)
  if (targetSafe) {
    parts.push(`Target safe zone: top ${targetSafe.top}px, bottom ${targetSafe.bottom}px, sides ${targetSafe.side}px`)
  }
  parts.push(`Height change: ${heightDelta}% (${severity} conversion)`)
  parts.push(`Proportional scale factors already applied: scaleX=${scaleX}, scaleY=${scaleY}`)

  parts.push(`\n## Source layer structure (coordinates are from the ORIGINAL master, before proportional scaling)`)
  parts.push(`\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)

  parts.push(`\nThe plugin has already applied proportional scaling (${scaleX}x, ${scaleY}y) to all elements. Produce art-directed refinements in the TARGET coordinate space (${target?.w || '?'}×${target?.h || '?'}).`)
  parts.push(`Only include steps for elements that need adjustment beyond the proportional baseline.`)

  return parts.join('\n')
}
