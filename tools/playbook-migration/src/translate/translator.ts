import { readFile } from 'node:fs/promises'
import Anthropic from '@anthropic-ai/sdk'

import { PATHS, loadConfig } from '../config.js'
import type { PageContent } from '../extract/types.js'
import { AuthoringPlanSchema, type AuthoringPlan } from './schemas.js'

const SYSTEM_INSTRUCTION_SUFFIX = `

You will receive a single SharePoint page as PageContent JSON in the user message.
You must respond with **exactly one JSON object** matching the AuthoringPlanSchema described in this skill.
No prose. No code fences. No commentary. Just the JSON object.
`

/**
 * Translate a single SharePoint PageContent into a Google-Sites-shaped AuthoringPlan
 * by calling Claude with the loop-playbook-migration skill loaded as the system prompt.
 *
 * Falls back to a deterministic, no-LLM rendering when ANTHROPIC_API_KEY is unset
 * (mostly useful for offline iteration on the extractor).
 */
export async function translatePage(page: PageContent): Promise<AuthoringPlan> {
  const cfg = loadConfig('translate')

  const skill = await readFile(PATHS.skill, 'utf8')
  const client = new Anthropic({ apiKey: cfg.ANTHROPIC_API_KEY! })

  const message = await client.messages.create({
    model: cfg.ANTHROPIC_MODEL,
    max_tokens: 8192,
    system: skill + SYSTEM_INSTRUCTION_SUFFIX,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text:
              `Translate this SharePoint page into an AuthoringPlan JSON object. ` +
              `Respond with the JSON object only, no surrounding text.\n\n` +
              JSON.stringify(page, null, 2),
          },
        ],
      },
    ],
  })

  const text = message.content
    .filter((c): c is Anthropic.TextBlock => c.type === 'text')
    .map((c) => c.text)
    .join('\n')

  const json = extractJsonObject(text)
  if (!json) {
    throw new Error(`Translator returned no JSON object. Response was:\n${text.slice(0, 2000)}`)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch (err) {
    throw new Error(`Translator returned invalid JSON: ${(err as Error).message}\n\n${json.slice(0, 1000)}`)
  }

  const validated = AuthoringPlanSchema.safeParse(parsed)
  if (!validated.success) {
    const issues = validated.error.issues.slice(0, 8).map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n')
    throw new Error(`Translator output failed schema validation:\n${issues}`)
  }
  return validated.data
}

/**
 * Render an AuthoringPlan as a human-readable Markdown preview. Used by both the dry-run
 * author mode (no Sites writes) and saved alongside the JSON for review.
 */
export function renderPlanMarkdown(plan: AuthoringPlan): string {
  const lines: string[] = []
  lines.push(`# Authoring plan: ${plan.title}`)
  lines.push('')
  lines.push(`Slug: \`${plan.slug}\``)
  lines.push('')

  if (plan.warnings.length > 0) {
    lines.push('## Warnings')
    for (const w of plan.warnings) lines.push(`- ${w}`)
    lines.push('')
  }

  if (plan.manualOverrides.length > 0) {
    lines.push('## Manual override checkpoints')
    for (const o of plan.manualOverrides) {
      const where = o.afterBlockIndex === -1 ? 'before any block' : `after block ${o.afterBlockIndex}`
      lines.push(`- ${where}: ${o.reason}`)
    }
    lines.push('')
  }

  lines.push('## Blocks')
  plan.blocks.forEach((block, idx) => {
    const overridesAfter = plan.manualOverrides.filter((o) => o.afterBlockIndex === idx - 1)
    for (const o of overridesAfter) {
      lines.push(`> [MANUAL: ${o.reason}]`)
      lines.push('')
    }
    lines.push(`### ${idx}. ${describeBlock(block)}`)
    lines.push('')
    lines.push(...renderBlockBody(block, '  '))
    lines.push('')
  })

  // Trailing override that points at the last block.
  for (const o of plan.manualOverrides.filter((o) => o.afterBlockIndex === plan.blocks.length - 1)) {
    lines.push(`> [MANUAL: ${o.reason}]`)
  }

  return lines.join('\n').trimEnd() + '\n'
}

function describeBlock(block: AuthoringPlan['blocks'][number]): string {
  switch (block.type) {
    case 'heading':
      return `H${block.level}: ${block.text}`
    case 'text':
      return `Text (${block.markdown.length} chars)`
    case 'image':
      return `Image (${block.layout}): ${block.localPath}`
    case 'divider':
      return 'Divider'
    case 'embed':
      return `Embed (${block.provider}): ${block.url}`
    case 'callout':
      return `Callout (${block.style})`
    case 'twoColumn':
      return `Two-column (left: ${block.left.length} blocks, right: ${block.right.length} blocks)`
  }
}

function renderBlockBody(block: AuthoringPlan['blocks'][number], indent: string): string[] {
  switch (block.type) {
    case 'heading':
      return [`${indent}**${block.text}**`]
    case 'text':
      return block.markdown.split('\n').map((l) => `${indent}${l}`)
    case 'image':
      return [`${indent}![${block.alt}](${block.localPath})`, block.caption ? `${indent}_${block.caption}_` : '']
    case 'divider':
      return [`${indent}---`]
    case 'embed':
      return [`${indent}<${block.url}>`]
    case 'callout':
      return [`${indent}> [${block.style.toUpperCase()}] ${block.markdown}`]
    case 'twoColumn': {
      const out: string[] = [`${indent}LEFT:`]
      for (const child of block.left) out.push(...renderBlockBody(child, indent + '  '))
      out.push(`${indent}RIGHT:`)
      for (const child of block.right) out.push(...renderBlockBody(child, indent + '  '))
      return out
    }
  }
}

function extractJsonObject(text: string): string | undefined {
  // Models occasionally wrap the JSON in markdown fences despite instructions; tolerate that.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fence?.[1]) return fence[1].trim()

  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return undefined
  return text.slice(start, end + 1)
}
