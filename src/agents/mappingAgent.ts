/**
 * Claude-powered Monday-to-Figma mapping agent.
 * Uses Heimdall Mapping Skill as system context; returns textMappings and frameRenames.
 * Falls back to column-only mapping when API key is missing or Claude fails.
 */

import Anthropic from '@anthropic-ai/sdk'
import { readFileSync } from 'fs'
import { join } from 'path'
import { z } from 'zod'
import { logger } from '../../lib/logger.js'
import type { MondayItem } from '../integrations/monday/client.js'
import { columnMap, getCol } from '../integrations/monday/client.js'
import { mondayItemToBriefing } from '../domain/briefing/mondayToBriefing.js'
import type { BriefingDTO } from '../domain/briefing/schema.js'
import { MAPPING_MODEL } from '../domain/briefingAssistant/models.js'

export interface TemplateNodeInfo {
  id: string
  name: string
  type: string
  children?: TemplateNodeInfo[]
}

export interface NodeMappingResult {
  textMappings: Array<{ nodeName: string; value: string }>
  frameRenames: Array<{ oldName: string; newName: string }>
}

const MappingOutputSchema = z.object({
  textMappings: z.array(z.object({ nodeName: z.string(), value: z.string() })),
  frameRenames: z.array(z.object({ oldName: z.string(), newName: z.string() })),
})

const VARIANT_LETTERS = ['A', 'B', 'C', 'D'] as const
const ASSET_SIZES = ['4x5', '9x16', '1x1'] as const

function getSkillPath(): string {
  const root = process.cwd()
  return join(root, 'skills', 'heimdall-mapping', 'SKILL.md')
}

function upsertMapping(
  mappings: Array<{ nodeName: string; value: string }>,
  nodeName: string,
  value: string | null | undefined,
  force?: boolean
): void {
  if (!value || !value.trim()) return
  const idx = mappings.findIndex((m) => m.nodeName === nodeName)
  if (idx >= 0) {
    // force: overwrite even if Claude already filled it (ensures verbatim doc content wins)
    if (force || !mappings[idx].value || !mappings[idx].value.trim()) mappings[idx].value = value
    return
  }
  mappings.push({ nodeName, value })
}

/** Canonical ALL CAPS labels for known Monday doc section headings (lowercase key). */
const HEADING_CANONICAL: Record<string, string> = {
  idea: 'IDEA',
  why: 'WHY',
  audience: 'AUDIENCE/REGION',
  'audience/region': 'AUDIENCE/REGION',
  formats: 'FORMATS',
  variants: 'VARIANTS',
  product: 'PRODUCT',
  visual: 'VISUAL',
  'copy info': 'COPY INFO',
  note: 'NOTE',
  test: 'TESTING',
  testing: 'TESTING',
}

/**
 * Extract all ## sections from doc in document order.
 * Unknown headings are included; use canonical map for known ones.
 */
function parseAllDocSections(doc: string): Array<{ heading: string; content: string }> {
  const sections: Array<{ heading: string; content: string }> = []
  // Match ## heading (line) then content until next ## or EOF
  const rx = /(?:^|\n)##\s*([^\n]+)\n([\s\S]*?)(?=\n##\s|\n*$)/gi
  let m: RegExpExecArray | null
  while ((m = rx.exec(doc)) !== null) {
    const heading = m[1].trim()
    const content = m[2].trim()
    if (heading) sections.push({ heading, content })
  }
  return sections
}

function getCanonicalLabel(heading: string): string {
  const key = heading.toLowerCase().trim()
  return HEADING_CANONICAL[key] ?? heading.toUpperCase()
}

function isKnownDocHeading(heading: string): boolean {
  const key = heading.toLowerCase().trim()
  return Object.prototype.hasOwnProperty.call(HEADING_CANONICAL, key)
}

/**
 * For FORMATS sections written as markdown checklists, keep only checked items
 * and strip checkbox markers so Figma shows clean plain text.
 * Supports: "- [x] item" and "[x] item" (docReader output). Unchecked "[ ]" lines are excluded.
 * Preserves full line text verbatim (e.g. aspect ratios like "video (9:16 + 4:5)").
 */
function extractCheckedFormats(content: string): string {
  const lines = content.split(/\r?\n/)
  const checkedItems: string[] = []
  let sawChecklist = false

  for (const rawLine of lines) {
    const line = rawLine.trim()
    // Match "- [x] item" or "[x] item" (no leading bullet)
    const checked =
      /^[-*]\s*\[(?:x|X)\]\s*(.+)$/.exec(line) ?? /^\[(?:x|X)\]\s*(.+)$/.exec(line)
    if (checked) {
      sawChecklist = true
      const value = checked[1].trim()
      if (value) checkedItems.push(`- ${value}`)
      continue
    }
    if (/^[-*]?\s*\[\s*\]\s*(.+)$/.test(line) || /^\[\s*\]\s*(.+)$/.test(line)) {
      sawChecklist = true
    }
  }

  const result = !sawChecklist ? content.trim() : checkedItems.join('\n').trim()
  return result
}

interface VariantRow {
  id: 'A' | 'B' | 'C' | 'D'
  type?: string
  visualDirection?: string
  script?: string
}

function firstSentence(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed)
  return (match?.[1] ?? trimmed).trim()
}

function remainderAfterFirstSentence(value: string | undefined): string | undefined {
  if (!value) return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  const match = /^.+?[.!?](?:\s+|$)([\s\S]+)$/.exec(trimmed)
  return match?.[1]?.trim() || undefined
}

/** Ensure a blank line precedes any line that starts with "Copy:" (variant block sub-label). */
function ensureBlankLineBeforeCopy(text: string): string {
  return text.replace(/\n(\s*Copy:)/gi, '\n\n$1')
}

function inferVariantCount(content: string, variantRows: VariantRow[]): number | null {
  const firstLine = content.split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? ''
  if (/^\d+$/.test(firstLine)) return Number(firstLine)

  const rowCount = new Set(variantRows.map((r) => r.id)).size
  if (rowCount > 0) return rowCount

  const inlineLetters = new Set<string>()
  for (const line of content.split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([A-D])\s*-\s*/i.exec(line)
    if (m) inlineLetters.add(m[1].toUpperCase())
  }
  return inlineLetters.size > 0 ? inlineLetters.size : null
}

/** Split a markdown table row (`| a | b |`) into trimmed cell values. */
function parseMarkdownRow(line: string): string[] {
  const trimmed = line.trim()
  if (!trimmed.startsWith('|')) return []
  const raw = trimmed.replace(/^\|/, '').replace(/\|$/, '')
  return raw.split('|').map((c) => c.trim())
}

/**
 * Parse variant tables from Monday doc markdown.
 * Supports both row shapes:
 *  - `| A - Video | input visual | Script |`
 *  - `| A | Static | input visual | input copy |`
 */
function parseVariantTableRows(doc: string): VariantRow[] {
  const out: VariantRow[] = []
  const lines = doc.split(/\r?\n/)

  let i = 0
  while (i < lines.length) {
    const headerCells = parseMarkdownRow(lines[i])
    const sepLine = lines[i + 1]?.trim() ?? ''
    const isSeparator = /^\|\s*[-: ]+\|\s*[-: |]+\|?\s*$/.test(sepLine)
    if (!headerCells.length || !isSeparator) {
      i++
      continue
    }

    const lowerHeaders = headerCells.map((h) => h.toLowerCase())
    const variantIdx = lowerHeaders.findIndex((h) => h.includes('variant'))
    if (variantIdx < 0) {
      i++
      continue
    }
    const typeIdx = lowerHeaders.findIndex((h) => h === 'type' || h.includes('type') || h.includes('format'))
    const visualIdx = lowerHeaders.findIndex((h) => h.includes('input visual') || h === 'visual')
    const scriptIdx = lowerHeaders.findIndex((h) => h.includes('script') || h.includes('input copy') || h === 'copy')

    // Capture table body until next heading (or EOF) so multiline cells are preserved.
    let end = lines.length
    for (let j = i + 2; j < lines.length; j++) {
      if (/^\s*##\s+/.test(lines[j])) {
        end = j
        break
      }
    }
    const tableBody = lines.slice(i + 2, end).join('\n')

    // Row starts can be either "| A - Video |" or "| A |".
    const rowStart = /^\|\s*([A-D])(?:\s*-\s*([^|]+))?\s*\|/gim
    const matches = Array.from(tableBody.matchAll(rowStart))
    for (let m = 0; m < matches.length; m++) {
      const current = matches[m]
      const start = current.index ?? 0
      const nextStart = matches[m + 1]?.index ?? tableBody.length
      const chunk = tableBody.slice(start, nextStart).trim()

      const id = current[1].toUpperCase() as VariantRow['id']
      const typeFromVariantCell = current[2]?.trim() || undefined

      // Split by table separators while preserving multiline cell content.
      const rowCells = chunk
        .split('|')
        .slice(1, -1)
        .map((c) => c.replace(/\r?\n\s*/g, '\n').trim())

      const type = typeFromVariantCell || (typeIdx >= 0 ? (rowCells[typeIdx] ?? '').trim() || undefined : undefined)
      const visualDirection = visualIdx >= 0 ? (rowCells[visualIdx] ?? '').trim() || undefined : undefined
      const script = scriptIdx >= 0 ? (rowCells[scriptIdx] ?? '').trim() || undefined : undefined
      out.push({ id, type, visualDirection, script })
    }

    // Continue scanning after this table block.
    i = end
    continue
  }

  return out
}

function deterministicBackfill(
  base: NodeMappingResult,
  mondayItem: MondayItem,
  mondayDocContent?: string | null
): NodeMappingResult {
  const out: NodeMappingResult = {
    textMappings: [...base.textMappings],
    frameRenames: [...base.frameRenames],
  }

  const col = columnMap(mondayItem)
  const region = getCol(col, 'region', 'audience_region', 'audience')
  const funnel = getCol(col, 'funnel', 'segment')

  upsertMapping(out.textMappings, 'Name EXP', mondayItem.name)
  if (funnel) upsertMapping(out.textMappings, 'SEGMENT: ALL', `SEGMENT: ${funnel}`)

  let usedDocAudience = false
  if (mondayDocContent?.trim()) {
    const sections = parseAllDocSections(mondayDocContent)
    const variantRows = parseVariantTableRows(mondayDocContent)
    let variantsCountAdded = false

    // Build single "Briefing Content" body from all sections (canonical ALL CAPS labels).
    const parts: string[] = []
    for (let s = 0; s < sections.length; s++) {
      const { heading } = sections[s]
      // Skip non-brief headings (doc title, intro section titles, etc.).
      if (!isKnownDocHeading(heading)) continue

      let content = sections[s].content.trim()
      // Monday docs sometimes emit bold one-liners as heading blocks right after a known heading.
      // If known heading content is empty, fold one unknown heading+content into this section.
      if (!content && s + 1 < sections.length && !isKnownDocHeading(sections[s + 1].heading)) {
        const next = sections[s + 1]
        content = [next.heading.trim(), next.content.trim()].filter(Boolean).join('\n').trim()
        s += 1
      }
      if (!content) continue

      const label = getCanonicalLabel(heading)
      if (label === 'AUDIENCE/REGION') usedDocAudience = true
      // VARIANTS: keep count only in Briefing Content; detailed variant body lives in the dedicated variant blocks below.
      if (label === 'VARIANTS') {
        const variantCount = inferVariantCount(content, variantRows)
        if (!variantsCountAdded && variantCount && Number.isFinite(variantCount) && variantCount > 0) {
          parts.push(`VARIANTS: ${variantCount}`)
          variantsCountAdded = true
        }
        continue
      } else {
        const cleaned = content
          .replace(/^visual\s*:\s*/i, '')
          .replace(/^copy\s+info\s*:\s*/i, '')
          .trim()
        const sectionContent = label === 'FORMATS' ? extractCheckedFormats(cleaned) : cleaned
        if (sectionContent) parts.push(`${label}:\n${sectionContent}`)
      }
    }
    const briefingContent = parts.join('\n\n')
    if (briefingContent) upsertMapping(out.textMappings, 'Briefing Content', briefingContent, true)

    // Variant rows from Monday table -> Briefing column variant blocks (ALL CAPS type, blank line before Copy:).
    for (const row of variantRows) {
      const typeLabel = row.type
        ? `${row.id} - ${row.type.toUpperCase()}`
        : `${row.id} - IMAGE`
      const hasVisual = row.visualDirection?.trim()
      const hasScript = row.script?.trim()
      let blockValue =
        hasVisual || hasScript
          ? `${typeLabel}\n${hasVisual ? `Input visual + copy direction: ${row.visualDirection!.trim()}\n` : ''}${hasScript ? `Script: ${row.script!.trim()}` : ''}`.trim()
          : typeLabel
      blockValue = ensureBlankLineBeforeCopy(blockValue)
      const hasContent = !!hasVisual || !!hasScript
      upsertMapping(out.textMappings, `${row.id} - Image`, blockValue, hasContent)
      upsertMapping(out.textMappings, `${row.id} - Image `, blockValue, hasContent)
    }

    // Ensure VARIANTS header node always shows "VARIANTS", never the count.
    upsertMapping(out.textMappings, 'VARIANTS', 'VARIANTS', true)
  }

  // Fallback when doc audience is missing: add region into Briefing Content.
  if (!usedDocAudience && region) {
    const existing = out.textMappings.find((m) => m.nodeName === 'Briefing Content')
    const audienceLine = `AUDIENCE/REGION: ${region}`
    if (existing?.value) {
      existing.value = audienceLine + '\n\n' + existing.value
    } else {
      out.textMappings.push({ nodeName: 'Briefing Content', value: audienceLine })
    }
  }

  return out
}

export function loadSkillContent(): string {
  try {
    return readFileSync(getSkillPath(), 'utf-8')
  } catch {
    return ''
  }
}

/**
 * Fallback: derive textMappings and frameRenames from BriefingDTO (column-only).
 */
export function briefingToNodeMapping(dto: BriefingDTO): NodeMappingResult {
  const textMappings: Array<{ nodeName: string; value: string }> = []
  const expName = dto.experimentName

  textMappings.push({ nodeName: 'Name EXP', value: expName })

  // Single Briefing Content body for flexible template (column-only fallback).
  const bodyParts: string[] = []
  if (dto.idea) bodyParts.push(`IDEA:\n${dto.idea}`)
  if (dto.audienceRegion) bodyParts.push(`AUDIENCE/REGION: ${dto.audienceRegion}`)
  if (dto.segment) bodyParts.push(`SEGMENT: ${dto.segment}`)
  if (dto.formats) bodyParts.push(`FORMATS:\n${dto.formats}`)
  if (dto.variants.length) bodyParts.push(`VARIANTS: ${dto.variants.length}`)
  const briefingContent = bodyParts.join('\n\n')
  if (briefingContent) textMappings.push({ nodeName: 'Briefing Content', value: briefingContent })

  for (let i = 0; i < dto.variants.length; i++) {
    const v = dto.variants[i]
    const letter = VARIANT_LETTERS[i]
    if (v.headline) textMappings.push({ nodeName: 'headline:', value: v.headline })
    if (v.subline) textMappings.push({ nodeName: 'subline:', value: v.subline })
    if (v.cta) textMappings.push({ nodeName: 'CTA:', value: v.cta })
    if (v.note) textMappings.push({ nodeName: 'Note:', value: v.note })
  }

  const frameRenames: Array<{ oldName: string; newName: string }> = []
  for (const letter of VARIANT_LETTERS) {
    for (const size of ASSET_SIZES) {
      frameRenames.push({
        oldName: `NAME-EXP-${size}`,
        newName: `${expName}-${letter}-${size}`,
      })
    }
  }

  return { textMappings, frameRenames }
}

/**
 * Call Claude to compute node mapping from Monday item + template tree (+ optional doc).
 * Returns fallback mapping if API key missing or request fails.
 */
export async function computeNodeMapping(
  mondayItem: MondayItem,
  templateNodeTree: TemplateNodeInfo[],
  options?: { mondayDocContent?: string | null; disableAi?: boolean }
): Promise<NodeMappingResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (options?.disableAi || !apiKey?.trim()) {
    logger.info('mapping', 'Claude mapping disabled or key missing; using deterministic fallback', {
      mondayItemId: mondayItem.id,
      disableAi: options?.disableAi === true,
    })
    const dto = mondayItemToBriefing(mondayItem)
    if (!dto) return { textMappings: [], frameRenames: [] }
    return deterministicBackfill(briefingToNodeMapping(dto), mondayItem, options?.mondayDocContent ?? null)
  }

  const mappingTimer = logger.time('mapping', 'Claude mapping agent')

  const skillContent = loadSkillContent()
  const userPayload = {
    mondayItem: {
      id: mondayItem.id,
      name: mondayItem.name,
      column_values: mondayItem.column_values ?? [],
    },
    templateNodeTree,
    mondayDocContent: options?.mondayDocContent ?? null,
  }
  const userMessage = `Map this Monday item and Monday briefing doc onto the Figma template nodes.

TASK: Extract ALL sections and content from the Monday doc (marked with ## headings, - bullets, [x] checklists) and map them to the corresponding Figma template text nodes. The doc uses markdown-like structure where:
- ## marks section headings (Idea, Why, Audience, Product, Visual, Copy info, etc.)
- - marks bullet list items
- [x] / [ ] mark checklist items (only [x] checked items must appear in FORMATS)
- Tables are formatted as | Variant | input visual | Script |

CRITICAL RULES:
1. Copy ALL text VERBATIM from the Monday doc. NEVER rewrite, paraphrase, summarize, or change any content. Every word must match the source exactly.
2. Extract COMPLETE sections including ALL nested bullets and sub-items. If a section has 5 bullet points, include all 5.
3. Reason through the doc structure step-by-step to ensure you capture every field.
4. FORMATS section: Include ONLY checklist lines that are CHECKED ([x]) in the Monday doc. Preserve the full line text including aspect ratios (e.g. "video (9:16 + 4:5)"). Do not list unchecked formats.

Variant block structure (use these exact sub-headers — they are the Monday column names):
- First line: variant type (e.g. "A - Video") from the Variant column.
- Then "Input visual + copy direction: " followed by the verbatim text from the "input visual + copy directions" column.
- Then "Script: " followed by the verbatim text from the Script column.

Mapping rules:
- Include one "Briefing Content" entry in textMappings with the FULL pre-variant doc body: concatenate all sections from Idea through Test/Note into a single string with clear labels (e.g. "IDEA:\\n...\\n\\nWHY:\\n..."). This maps to the single Briefing Content text node in Figma.
- Fill variant rows A/B/C/D from Monday into the Briefing column variant blocks (A - Image, B - Image, etc.) using the structure above. Copy all text WORD FOR WORD.
- Map Briefing variant type labels (A - Image -> A - Static, etc.) and put the full variant block into those same nodes.
- Do NOT put this input data into the Copy column Variation frames — those are for final in-design copy only.
- Only fill Copy column Variation frames (headline:/subline:/CTA:/Note:) when the Monday doc has explicit "in design copy" for that variation.

OUTPUT: Return only a single JSON object with keys "textMappings" and "frameRenames", no markdown or explanation.

${JSON.stringify(userPayload, null, 2)}`

  try {
    const client = new Anthropic({ apiKey })
    const thinkingBudget = Number(process.env.ANTHROPIC_THINKING_BUDGET) || 10000
    const response = await client.messages.create({
      model: MAPPING_MODEL,
      max_tokens: 16000,
      thinking: {
        type: 'enabled',
        budget_tokens: thinkingBudget,
      },
      system: skillContent || 'You are a mapping agent that reasons through Monday doc structure to extract all content. Return only valid JSON with textMappings and frameRenames.',
      messages: [{ role: 'user', content: userMessage }],
    })

    const textBlock = response.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? textBlock.text : null
    if (!text?.trim()) {
      return fallbackMapping(mondayItem)
    }

    const raw = text.trim()
    const json = raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw
    const parsed = JSON.parse(json) as unknown
    const result = MappingOutputSchema.safeParse(parsed)
    if (result.success) {
      const out = deterministicBackfill(result.data, mondayItem, options?.mondayDocContent ?? null)
      mappingTimer.done({
        mondayItemId: mondayItem.id,
        textMappingsCount: out.textMappings.length,
        frameRenamesCount: out.frameRenames.length,
      })
      return out
    }
    mappingTimer.done({ mondayItemId: mondayItem.id, fallback: 'schema_invalid' })
    logger.warn('mapping', 'Claude response schema invalid; using fallback', { mondayItemId: mondayItem.id })
    return deterministicBackfill(fallbackMapping(mondayItem), mondayItem, options?.mondayDocContent ?? null)
  } catch (err) {
    logger.error('mapping', 'Claude mapping agent failed', err as Error, { mondayItemId: mondayItem.id })
    return deterministicBackfill(fallbackMapping(mondayItem), mondayItem, options?.mondayDocContent ?? null)
  }
}

function fallbackMapping(mondayItem: MondayItem): NodeMappingResult {
  const dto = mondayItemToBriefing(mondayItem)
  if (!dto) return { textMappings: [], frameRenames: [] }
  return briefingToNodeMapping(dto)
}
