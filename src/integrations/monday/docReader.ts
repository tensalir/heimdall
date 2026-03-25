/**
 * Fetch Monday Doc blocks for the mapping agent.
 * Requires docs:read scope on the Monday API token.
 * If the doc is inaccessible or the column has no doc id, returns null.
 */

import { mondayGraphql } from './client.js'
import type { MondayImageAttachment } from './client.js'

type JsonObject = Record<string, unknown>

export interface MondayDocReferenceLink {
  url: string
  label?: string
  source: 'doc_reference'
}

function parseJsonObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'string') return null
  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as JsonObject
    }
  } catch {
    // ignore non-json strings
  }
  return null
}

/**
 * Extract plain text from a block content (may be Delta JSON or string).
 * Detects if content is bold-only (heading marker) for markdown output.
 */
function blockToText(content: unknown): { text: string; isBoldOnly: boolean } {
  if (content == null) return { text: '', isBoldOnly: false }

  let text = ''
  let isBoldOnly = false

  if (typeof content === 'string') {
    const parsed = parseJsonObject(content)
    if (parsed) {
      if (Array.isArray(parsed.deltaFormat)) {
        const ops = parsed.deltaFormat as Array<{ insert?: string; attributes?: Record<string, unknown> }>
        text = ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('')
        isBoldOnly = ops.length > 0 && ops.every((op) => !op.insert || op.attributes?.bold === true)
      } else if (Array.isArray(parsed.ops)) {
        const ops = parsed.ops as Array<{ insert?: string; attributes?: Record<string, unknown> }>
        text = ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('')
        isBoldOnly = ops.length > 0 && ops.every((op) => !op.insert || op.attributes?.bold === true)
      } else if (typeof parsed.text === 'string') {
        text = parsed.text
      } else if (Array.isArray(parsed.cells)) {
        return { text: '', isBoldOnly: false }
      }
    } else {
      text = content
    }
  } else if (typeof content !== 'object') {
    text = String(content)
  } else {
    const obj = content as Record<string, unknown>
    if (Array.isArray(obj.deltaFormat)) {
      const ops = obj.deltaFormat as Array<{ insert?: string; attributes?: Record<string, unknown> }>
      text = ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('')
      isBoldOnly = ops.length > 0 && ops.every((op) => !op.insert || op.attributes?.bold === true)
    } else if (Array.isArray(obj.ops)) {
      const ops = obj.ops as Array<{ insert?: string; attributes?: Record<string, unknown> }>
      text = ops.map((op) => (typeof op.insert === 'string' ? op.insert : '')).join('')
      isBoldOnly = ops.length > 0 && ops.every((op) => !op.insert || op.attributes?.bold === true)
    } else if (typeof obj.text === 'string') {
      text = obj.text
    }
  }

  return { text, isBoldOnly }
}

function getTableCells(content: unknown): Array<Array<{ blockId?: string }>> | null {
  if (content == null) return null
  let obj: JsonObject | null = null
  if (typeof content === 'string') {
    obj = parseJsonObject(content)
  } else if (typeof content === 'object' && !Array.isArray(content)) {
    obj = content as JsonObject
  }
  if (!obj || !Array.isArray(obj.cells)) return null
  return obj.cells as Array<Array<{ blockId?: string }>>
}

function isPureStyleJsonText(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return false
  const parsed = parseJsonObject(trimmed)
  if (!parsed) return false
  const keys = Object.keys(parsed)
  if (!keys.length) return true
  const styleKeys = new Set(['backgroundColor', 'alignment', 'direction', 'columnsStyle', 'width'])
  return keys.every((k) => styleKeys.has(k))
}

function normalizeCellText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .trim()
}

interface DocBlock {
  id: string
  type?: string
  parent_block_id?: string | null
  content?: unknown
}

const DOC_URL_KEYS = new Set([
  'href',
  'link',
  'rawurl',
  'raw_url',
  'url',
  'publicurl',
  'public_url',
])

function normalizeExtractedUrl(url: string): string {
  return url.trim().replace(/[)>.,;]+$/g, '')
}

function extractUrlsFromUnknown(raw: unknown, urls: Set<string>, depth = 0): void {
  const MAX_DEPTH = 8
  if (depth > MAX_DEPTH || raw == null) return

  if (typeof raw === 'string') {
    const parsed = parseJsonObject(raw)
    if (parsed) {
      extractUrlsFromUnknown(parsed, urls, depth + 1)
    }
    const matches = raw.match(/https?:\/\/[^\s<>"'`]+/gi) ?? []
    for (const match of matches) {
      const normalized = normalizeExtractedUrl(match)
      if (normalized) urls.add(normalized)
    }
    return
  }

  if (Array.isArray(raw)) {
    for (const item of raw) extractUrlsFromUnknown(item, urls, depth + 1)
    return
  }

  if (typeof raw !== 'object') return

  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string' && DOC_URL_KEYS.has(key.toLowerCase())) {
      const normalized = normalizeExtractedUrl(value)
      if (/^https?:\/\//i.test(normalized)) urls.add(normalized)
    }
    extractUrlsFromUnknown(value, urls, depth + 1)
  }
}

function isHeadingTextBlock(block: DocBlock): boolean {
  const { text, isBoldOnly } = blockToText(block.content)
  const trimmed = text.trim()
  const blockType = String(block.type ?? '').toLowerCase()
  if (!trimmed) return false
  return (
    blockType === 'small title' ||
    blockType === 'medium title' ||
    (blockType === 'normal text' && isBoldOnly && trimmed.length < 80)
  )
}

function isReferenceHeading(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[:\s]+/g, ' ').trim()
  return normalized === 'reference' || normalized === 'references'
}

function collectDescendantText(
  parentId: string,
  childrenByParent: Map<string, DocBlock[]>,
  visited: Set<string>
): string {
  const children = childrenByParent.get(parentId) ?? []
  const parts: string[] = []
  for (const child of children) {
    if (visited.has(child.id)) continue
    visited.add(child.id)
    const ownText = normalizeCellText(blockToText(child.content).text)
    if (ownText && !isPureStyleJsonText(ownText)) parts.push(ownText)
    const nested = collectDescendantText(child.id, childrenByParent, visited)
    if (nested) parts.push(nested)
  }
  return parts.join('\n').trim()
}

/**
 * Fetch a Monday Doc by id and return its block content as a single string (for the mapping agent).
 * Returns null if token missing, doc not found, or API error (e.g. docs:read not granted).
 */
export async function getDocContent(docId: string): Promise<string | null> {
  if (!docId.trim()) return null
  const id = docId.trim().replace(/^doc_/i, '')
  if (!id) return null

  try {
    const objectId = Number(id)
    if (!Number.isFinite(objectId)) return null

    const allBlocks: DocBlock[] = []
    let page = 1
    const limit = 100
    while (true) {
      const data = await mondayGraphql<{
        docs?: Array<{
          id: string
          object_id?: string
          name?: string
          blocks?: DocBlock[]
        }>
      }>(
        `query ($objectIds: [ID!]!, $limit: Int!, $page: Int!) {
          docs(object_ids: $objectIds) {
            id
            object_id
            name
            blocks(limit: $limit, page: $page) {
              id
              type
              parent_block_id
              content
            }
          }
        }`,
        { objectIds: [objectId], limit, page }
      )
      const doc = data?.docs?.[0]
      const blocks = doc?.blocks ?? []
      if (!blocks.length) break
      allBlocks.push(...blocks)
      if (blocks.length < limit) break
      page += 1
    }

    if (!allBlocks.length) return null
    const byId = new Map<string, DocBlock>()
    for (const block of allBlocks) byId.set(block.id, block)
    const childrenByParent = new Map<string, DocBlock[]>()
    for (const block of allBlocks) {
      const parentId = block.parent_block_id ? String(block.parent_block_id) : ''
      if (!parentId) continue
      const arr = childrenByParent.get(parentId) ?? []
      arr.push(block)
      childrenByParent.set(parentId, arr)
    }

    // Reconstruct table blocks from cell block references so variant rows stay aligned.
    const tableMarkdownById = new Map<string, string>()
    const consumedCellBlockIds = new Set<string>()
    const consumedDescendantBlockIds = new Set<string>()
    for (const block of allBlocks) {
      const cells = getTableCells(block.content)
      if (!cells || !cells.length) continue

      const rows: string[] = []
      for (let r = 0; r < cells.length; r++) {
        const row = cells[r] ?? []
        const values = row.map((cell) => {
          const blockId = cell?.blockId ? String(cell.blockId) : ''
          if (!blockId) return ''
          consumedCellBlockIds.add(blockId)
          const source = byId.get(blockId)
          if (!source) return ''
          const visited = new Set<string>()
          const { text: ownText } = blockToText(source.content)
          const normalizedOwn = normalizeCellText(ownText)
          if (normalizedOwn && !isPureStyleJsonText(normalizedOwn)) visited.add(source.id)
          const nestedText = collectDescendantText(source.id, childrenByParent, visited)
          for (const id of visited) consumedDescendantBlockIds.add(id)
          if (normalizedOwn && !isPureStyleJsonText(normalizedOwn)) {
            return [normalizedOwn, nestedText].filter(Boolean).join('\n').trim()
          }
          return nestedText
        })
        rows.push(`| ${values.join(' | ')} |`)
        if (r === 0) {
          rows.push(`| ${values.map(() => '---').join(' | ')} |`)
        }
      }
      const tableMarkdown = rows.join('\n').trim()
      if (tableMarkdown) tableMarkdownById.set(block.id, tableMarkdown)
    }

    const parts: string[] = []
    for (const block of allBlocks) {
      const tableMarkdown = tableMarkdownById.get(block.id)
      if (tableMarkdown) {
        parts.push(tableMarkdown)
        continue
      }
      if (consumedCellBlockIds.has(block.id)) continue
      if (consumedDescendantBlockIds.has(block.id)) continue

      const { text, isBoldOnly } = blockToText(block.content)
      const trimmed = text.trim()
      if (!trimmed) continue
      if (isPureStyleJsonText(trimmed)) continue

      const blockType = block.type ?? ''
      let formatted = trimmed

      // Prefix headings: small title, medium title, or bold-only normal text
      if (blockType === 'small title' || blockType === 'medium title' || (blockType === 'normal text' && isBoldOnly && trimmed.length < 80)) {
        formatted = `## ${trimmed}`
      }
      // Prefix bullet lists
      else if (blockType === 'bulleted list') {
        formatted = `- ${trimmed}`
      }
      // Prefix check lists with [x] / [ ].
      // Monday API returns content as a JSON *string* with a `checked` boolean field.
      else if (blockType === 'check list') {
        let checked = false
        if (typeof block.content === 'string') {
          const parsed = parseJsonObject(block.content)
          if (parsed && parsed.checked === true) checked = true
        } else if (typeof block.content === 'object' && block.content !== null) {
          checked = (block.content as Record<string, unknown>).checked === true
        }
        formatted = checked ? `[x] ${trimmed}` : `[ ] ${trimmed}`
      }

      parts.push(formatted)
    }
    return parts.length ? parts.join('\n\n') : null
  } catch (err) {
    console.error('[docReader] getDocContent failed for docId', docId, err instanceof Error ? err.message : err)
    return null
  }
}

/** Get string value from obj by key, trying exact and lowercase key match. */
function getStringFromObj(obj: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    for (const [k, v] of Object.entries(obj)) {
      if (
        typeof v === 'string' &&
        v.trim() &&
        (k === key || k.toLowerCase() === key.toLowerCase())
      ) {
        return v
      }
    }
  }
  return null
}

/** Keys we treat as asset/file identifiers (including 'id' when value looks like a numeric asset id). */
const ASSET_ID_KEYS = ['assetId', 'asset_id', 'fileId', 'file_id', 'id']

/** Get string or number (as string) for asset/file id from obj. */
function getAssetIdFromObj(obj: Record<string, unknown>): string | undefined {
  const lowerIdKeys = new Set(ASSET_ID_KEYS.map((k) => k.toLowerCase()))
  for (const [k, v] of Object.entries(obj)) {
    if (!lowerIdKeys.has(k.toLowerCase())) continue
    // Skip generic 'id' if it looks like a UUID or block id (keep numeric asset ids)
    if (k.toLowerCase() === 'id' && typeof v === 'string' && /^[0-9a-f-]{20,}$/i.test(v)) continue
    if (typeof v === 'string' && v.trim()) return v
    if (typeof v === 'number' && Number.isFinite(v)) return String(v)
  }
  return undefined
}

/** URL-like keys we accept for image source (any casing). */
const IMAGE_URL_KEYS = ['src', 'url', 'publicUrl', 'public_url']

/** Recursively flatten block content into a single object; unwrap nested data/content/image/file. */
function normalizeImageContent(raw: unknown, depth = 0): Record<string, unknown> | null {
  const MAX_DEPTH = 5
  if (depth > MAX_DEPTH) return null

  let obj: Record<string, unknown> | null = null
  if (typeof raw === 'string') {
    obj = parseJsonObject(raw)
  } else if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    obj = raw as Record<string, unknown>
  }
  if (!obj) return null

  const nested = obj.data ?? obj.content ?? obj.image ?? obj.file
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = normalizeImageContent(nested, depth + 1)
    const merged = { ...obj, ...(inner ?? (nested as Record<string, unknown>)) }
    return merged
  }
  return obj
}

/**
 * Extract image URLs from Monday Doc blocks.
 * Handles stringified or structured content; supports src, url, publicUrl/public_url, assetId/asset_id/fileId (any casing).
 */
export async function getDocImages(docId: string): Promise<MondayImageAttachment[]> {
  if (!docId.trim()) return []
  const id = docId.trim().replace(/^doc_/i, '')
  if (!id) return []

  try {
    const objectId = Number(id)
    if (!Number.isFinite(objectId)) return []

    const allBlocks: DocBlock[] = []
    let page = 1
    const limit = 100
    while (true) {
      const data = await mondayGraphql<{
        docs?: Array<{
          id: string
          blocks?: DocBlock[]
        }>
      }>(
        `query ($objectIds: [ID!]!, $limit: Int!, $page: Int!) {
          docs(object_ids: $objectIds) {
            id
            blocks(limit: $limit, page: $page) {
              id
              type
              content
            }
          }
        }`,
        { objectIds: [objectId], limit, page }
      )
      const doc = data?.docs?.[0]
      const blocks = doc?.blocks ?? []
      if (!blocks.length) break
      allBlocks.push(...blocks)
      if (blocks.length < limit) break
      page += 1
    }

    const images: MondayImageAttachment[] = []
    let imageBlocksSeen = 0
    for (const block of allBlocks) {
      const blockType = (block.type ?? '').toLowerCase()
      if (blockType !== 'image' && blockType !== 'file') continue
      imageBlocksSeen++

      const content = normalizeImageContent(block.content)
      if (!content) continue

      const url =
        getStringFromObj(content, 'src', 'url', 'publicUrl', 'public_url', 'rawUrl', 'raw_url') ?? null
      const assetId = getAssetIdFromObj(content)
      const name =
        getStringFromObj(content, 'name', 'fileName', 'file_name') ?? `doc-image-${block.id}`

      if (url || assetId) {
        images.push({
          url: url ?? '',
          name,
          source: 'doc',
          ...(assetId && { assetId }),
        })
      }
    }
    return images
  } catch (err) {
    console.error('[docReader] getDocImages failed for docId', docId, err instanceof Error ? err.message : err)
    return []
  }
}

/**
 * Extract user-added links from the "Reference" section of a Monday Doc.
 * Ignores URLs outside that section and ignores image/file block URLs since
 * those are already handled by getDocImages().
 */
export async function getDocReferenceLinks(docId: string): Promise<MondayDocReferenceLink[]> {
  if (!docId.trim()) return []
  const id = docId.trim().replace(/^doc_/i, '')
  if (!id) return []

  try {
    const objectId = Number(id)
    if (!Number.isFinite(objectId)) return []

    const allBlocks: DocBlock[] = []
    let page = 1
    const limit = 100
    while (true) {
      const data = await mondayGraphql<{
        docs?: Array<{
          id: string
          blocks?: DocBlock[]
        }>
      }>(
        `query ($objectIds: [ID!]!, $limit: Int!, $page: Int!) {
          docs(object_ids: $objectIds) {
            id
            blocks(limit: $limit, page: $page) {
              id
              type
              parent_block_id
              content
            }
          }
        }`,
        { objectIds: [objectId], limit, page }
      )
      const doc = data?.docs?.[0]
      const blocks = doc?.blocks ?? []
      if (!blocks.length) break
      allBlocks.push(...blocks)
      if (blocks.length < limit) break
      page += 1
    }

    const links: MondayDocReferenceLink[] = []
    const seenUrls = new Set<string>()
    let inReferenceSection = false
    let pendingLabel: string | undefined

    for (const block of allBlocks) {
      const blockType = String(block.type ?? '').toLowerCase()
      const trimmed = normalizeCellText(blockToText(block.content).text)

      if (isHeadingTextBlock(block)) {
        if (isReferenceHeading(trimmed)) {
          inReferenceSection = true
          pendingLabel = undefined
        } else if (inReferenceSection) {
          inReferenceSection = false
          pendingLabel = undefined
        }
        continue
      }

      if (!inReferenceSection) continue
      if (blockType === 'image' || blockType === 'file') continue

      const blockUrls = new Set<string>()
      extractUrlsFromUnknown(block.content, blockUrls)

      if (blockUrls.size === 0) {
        if (trimmed && !isPureStyleJsonText(trimmed)) {
          pendingLabel = trimmed.length <= 180 ? trimmed : `${trimmed.slice(0, 177)}...`
        }
        continue
      }

      const normalizedText = normalizeExtractedUrl(trimmed)
      const labelFromBlock =
        trimmed && !blockUrls.has(normalizedText) && !/^https?:\/\//i.test(trimmed)
          ? trimmed
          : undefined
      const label = labelFromBlock ?? pendingLabel

      for (const url of blockUrls) {
        if (seenUrls.has(url)) continue
        seenUrls.add(url)
        links.push({
          url,
          ...(label && label !== url ? { label } : {}),
          source: 'doc_reference',
        })
      }

      pendingLabel = undefined
    }

    return links
  } catch (err) {
    console.error(
      '[docReader] getDocReferenceLinks failed for docId',
      docId,
      err instanceof Error ? err.message : err
    )
    return []
  }
}

/**
 * Get doc id from a Monday item column value (e.g. Brief column).
 * Column value may be: a string doc id, or JSON like { "docId": 123 } or { "link": "..." }.
 */
export function getDocIdFromColumnValue(value: string | number | null | undefined): string | null {
  if (value == null || value === '') return null
  const s = String(value).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return s
  try {
    const parsed = JSON.parse(s) as Record<string, unknown>
    if (Array.isArray(parsed.files) && parsed.files.length > 0) {
      const first = parsed.files[0] as Record<string, unknown>
      if (first && typeof first.objectId !== 'undefined') return String(first.objectId)
      if (first && typeof first.linkToFile === 'string') {
        const match = /docs\/(\d+)/i.exec(first.linkToFile)
        if (match) return match[1]
      }
    }
    if (parsed && typeof parsed.docId !== 'undefined') return String(parsed.docId)
    if (parsed && typeof parsed.link === 'string') {
      const match = /doc[s]?\/(\d+)/i.exec(parsed.link) || /id=(\d+)/.exec(parsed.link)
      if (match) return match[1]
    }
  } catch {
    // not JSON
  }
  return s
}
