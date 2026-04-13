/**
 * Claude-powered planner for aspect-ratio resize / format derivation.
 *
 * Given a source frame's layer structure and a target aspect ratio,
 * produces an EditPlan with move/scale/reflow/crop-shift steps that
 * adapt the layout while preserving visual hierarchy and story.
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

Your job: given the source frame layer structure and a target aspect ratio, produce a JSON edit plan telling the plugin exactly how to reposition, scale, reflow, or crop-shift each element so the resized version looks intentionally designed for the new format — not mechanically squashed.

Key constraints:
- The plugin has ALREADY cloned and resized the frame to the target dimensions.
- Your steps will be applied AFTER the frame is at the correct target size.
- Each step uses the TARGET coordinate space.
- Element coordinates in the layer data are from the SOURCE frame.

Available actions per step:
- "move": { dx, dy } or { x, y } — reposition an element
- "scale": { factor } or { factorX, factorY } — scale an element
- "reflow": { maxWidth, fontSize? } — reflow text to fit a narrower width
- "crop-shift": { zoom, panX, panY } — adjust crop/pan on an image rectangle

Design principles:
- Preserve visual hierarchy. The primary message should read first.
- Respect safe zones. All content must stay within the safe zone.
- Background images should remain full-bleed; adjust crop-shift if the aspect change affects subject framing.
- Prefer keeping element widths similar; compensate for height changes through vertical spacing.
- For severe compressions (>45% height loss, like 9:16→1:1), text may need to shrink and groups may need to restructure vertically.
- For mild compressions (<30%), repositioning is usually sufficient.

Story preservation:
- The background image carries part of the ad's meaning (person, lifestyle, product in use).
- If overlays would cover story-carrying regions after resize, move overlays to less narrative-critical areas (usually lower in the frame).
- Include a "storyPreservation" field in your output.

Return ONLY a JSON object in this shape:
{
  "mode": "layered-iteration",
  "sourceDescription": "brief description of the ad",
  "steps": [
    { "action": "move|scale|reflow|crop-shift", "targetNodeName": "node name", "params": { ... }, "rationale": "why" }
  ],
  "targetRatios": ["target ratio"],
  "confidence": "high|medium|low",
  "humanReviewNeeded": boolean,
  "reasoning": "overall approach",
  "storyPreservation": {
    "storySubject": "what the background shows",
    "protectedRegions": ["face", "gesture", ...],
    "occlusionRisk": "low|medium|high",
    "recommendedAdjustment": "none|move_up|move_down|...",
    "rationale": "why"
  }
}`

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

  const parts: string[] = []

  parts.push(`## Source frame (${request.sourceWidth}×${request.sourceHeight}, detected ${request.sourceRatio || 'unknown'})`)
  if (sourceSafe) {
    parts.push(`Source safe zone: top ${sourceSafe.top}px, bottom ${sourceSafe.bottom}px, sides ${sourceSafe.side}px`)
  }

  parts.push(`\n## Target: ${request.targetRatio} (${target?.w || '?'}×${target?.h || '?'})`)
  if (targetSafe) {
    parts.push(`Target safe zone: top ${targetSafe.top}px, bottom ${targetSafe.bottom}px, sides ${targetSafe.side}px`)
  }
  parts.push(`Height change: ${heightDelta}% (${severity} conversion)`)

  parts.push(`\n## Layer structure\n\`\`\`json\n${JSON.stringify(request.layerData, null, 2)}\n\`\`\``)

  parts.push(`\nProduce an edit plan with steps in the TARGET coordinate space (${target?.w || '?'}×${target?.h || '?'}).`)

  return parts.join('\n')
}
