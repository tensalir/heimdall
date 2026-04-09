/**
 * Structured context builder for Loop briefing generation.
 * Assembles skill instructions, evidence blocks, metadata, and optional
 * similar-brief retrieval into a system + user message pair for Claude.
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import type { EvidenceSnippet } from './angleContext.js'
import { matchEvidenceChunks, isEvidenceRetrievalAvailable } from '@/lib/evidenceClient.js'

function loadSkillContent(): string {
  try {
    const root = process.cwd()
    return readFileSync(join(root, 'skills', 'loop-briefing-strategy', 'SKILL.md'), 'utf-8')
  } catch {
    return ''
  }
}

let _cachedSkill: string | null = null

function getSkillContent(): string {
  if (_cachedSkill !== null) return _cachedSkill
  _cachedSkill = loadSkillContent()
  return _cachedSkill
}

export interface BriefingContextInput {
  briefName: string
  productOrUseCase: string
  format: string
  funnel: string
  agencyRef: string
  assetCount: number
  datasourceEvidence: EvidenceSnippet[]
  sourceItemLines: string[]
}

export interface BriefingContextOutput {
  system: string
  user: string
}

export async function buildBriefingContext(
  input: BriefingContextInput,
): Promise<BriefingContextOutput> {
  const skill = getSkillContent()

  const similarBriefs = await fetchSimilarBriefs(input.productOrUseCase)

  const evidenceParts: string[] = []
  let refIndex = 1

  if (input.datasourceEvidence.length > 0) {
    evidenceParts.push(
      `Evidence from data sources (use to ground your sections where relevant):\n${input.datasourceEvidence
        .map((e) => `[${refIndex++}] (id: ${e.id}) ${e.text}${e.recency ? ` (${e.recency})` : ''}`)
        .join('\n')}`,
    )
  }

  if (input.sourceItemLines.length > 0) {
    evidenceParts.push(
      `Evidence from selected source items (ads, trends, comments, etc.):\n${input.sourceItemLines
        .map((line) => `[${refIndex++}] ${line}`)
        .join('\n')}`,
    )
  }

  if (similarBriefs.length > 0) {
    evidenceParts.push(
      `Similar past briefings (for context, not copying):\n${similarBriefs
        .map((b) => `[${refIndex++}] ${b}`)
        .join('\n')}`,
    )
  }

  const evidenceBlock =
    evidenceParts.length > 0 ? `\n\n${evidenceParts.join('\n\n')}\n` : ''

  const user = `Generate a Loop Earplugs creative briefing for the following assignment.
${evidenceBlock}
Assignment metadata:
- Brief name: ${input.briefName}
- Product / use case: ${input.productOrUseCase || '(not specified)'}
- Format: ${input.format}
- Funnel stage: ${input.funnel} (tof = top of funnel, bof = bottom of funnel, retention)
- Agency: ${input.agencyRef || '(not specified)'}
- Number of assets: ${input.assetCount}

Generate the 8-section JSON briefing now.`

  const system = skill || fallbackSystem()

  return { system, user }
}

function fallbackSystem(): string {
  return `You are a creative strategist for Loop Earplugs. Generate briefings with 8 sections: idea, why, audience, product, visual, copyInfo, test, variants. Each 1-3 sentences, plain text, no markdown. Return only valid JSON.`
}

async function fetchSimilarBriefs(productOrUseCase: string): Promise<string[]> {
  if (!productOrUseCase || !isEvidenceRetrievalAvailable()) return []
  try {
    const chunks = await matchEvidenceChunks({
      query: `creative briefing ${productOrUseCase} Loop Earplugs`,
      matchCount: 5,
      similarityThreshold: 0.25,
      datasourceId: 'prior_briefings',
      productOrUseCase,
    })
    return chunks
      .filter((c) => c.content.length > 40)
      .map((c) => {
        const ctx = c.context_json as Record<string, unknown> | null
        const name = ctx?.brief_name ? String(ctx.brief_name) : 'Prior brief'
        const section = ctx?.section ? String(ctx.section) : ''
        return `(${name}${section ? ` / ${section}` : ''}): ${c.content.slice(0, 300)}`
      })
  } catch {
    return []
  }
}
