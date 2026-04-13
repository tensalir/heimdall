/**
 * Claude-powered copy planner for paid-social ad copy.
 *
 * Uses the vendored loop-paid-social skill as system context
 * to generate on-brand copy variants that match Loop's voice,
 * comply with guardrails, and follow the proven ad patterns
 * from the 295-ad reference library.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { AnalyzeRequest, CopyPlan } from '../types.js'
import { loadSkillWithReferences, extractJson } from './skillLoader.js'
import { formatCreativeContextBlock } from './creativeContextFormatter.js'

const client = new Anthropic()

const PAID_SOCIAL_REFS = [
  'voice/voice.md',
  'voice/house-style.md',
  'compliance/claims.md',
  'compliance/sensitivities.md',
  'frameworks/comms-hierarchy.md',
  'frameworks/ad-anatomy.md',
]

function buildSystemPrompt(): string {
  const skillContext = loadSkillWithReferences('loop-paid-social', PAID_SOCIAL_REFS)

  if (!skillContext) {
    return `You are a paid-social copywriter for Loop Earplugs. Write on-brand ad copy following Loop's voice: bold, straightforward, fun, inclusive. American English. Follow hook → relevance → trust structure.`
  }

  return `${skillContext}

## Additional context for this session

You are being called by the Iterator plugin to generate copy for a paid-social ad iteration. Your output must be structured JSON matching the CopyPlan schema. Generate copy that feels like a close cousin of the reference ad — not a generic rewrite, not identical, but recognizably from the same campaign family.

When iterating on an existing ad:
- Analyze the reference ad's copy structure, hook type, and angle
- Generate variants that explore nearby angles, not wildly different ones
- Keep the same product assignment unless explicitly asked to change it
- Match the approximate character counts and structure of the reference`
}

export async function planCopy(request: AnalyzeRequest): Promise<CopyPlan> {
  const systemPrompt = buildSystemPrompt()
  const userContent = buildUserMessage(request)

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude for copy planning')
  }

  return JSON.parse(extractJson(textBlock.text)) as CopyPlan
}

function buildUserMessage(request: AnalyzeRequest): string {
  const parts: string[] = []

  if (request.briefing) {
    parts.push(`## Creative briefing / iteration request\n${request.briefing}`)
  }

  if (request.layerData) {
    const layers = request.layerData as Record<string, unknown>
    const textNodes: string[] = []
    function extractText(obj: unknown) {
      if (!obj || typeof obj !== 'object') return
      const o = obj as Record<string, unknown>
      if (o.characters && typeof o.characters === 'string') {
        textNodes.push(`"${o.characters}"`)
      }
      if (o.children && Array.isArray(o.children)) {
        for (const child of o.children) extractText(child)
      }
    }
    extractText(layers)
    if (textNodes.length > 0) {
      parts.push(`## Existing copy in the reference ad\n${textNodes.join('\n')}`)
    }
  }

  if (request.targetRatios?.length) {
    parts.push(`## Target formats\n${request.targetRatios.join(', ')}`)
  }

  const contextBlock = formatCreativeContextBlock(request.creativeContext)
  if (contextBlock) {
    parts.push(contextBlock)
  }

  parts.push(`Generate paid-social copy variants for this ad. Return JSON matching this shape:
{
  "variants": [
    {
      "captionPrimaryText": "...",
      "headline": "...",
      "description": "...",
      "cta": "...",
      "productAssignment": "...",
      "hookType": "question|callout|confession|micro-drama|identity-statement",
      "angle": "..."
    }
  ],
  "copyStrategy": "shared_caption|per_variant",
  "qaFlags": ["..."],
  "nextTestIdeas": ["..."],
  "reasoning": "..."
}

Generate at least 4 distinct variants unless the brief specifies fewer.`)

  return parts.join('\n\n')
}
