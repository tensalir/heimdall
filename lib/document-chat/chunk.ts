import { CHUNK_OVERLAP_CHARS, CHUNK_TARGET_CHARS, MAX_CHUNKS_PER_DOCUMENT } from './constants.js'

/**
 * Split markdown into coarse sections (headings and horizontal rules).
 */
function splitMarkdownSections(markdown: string): string[] {
  const normalized = markdown.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const byHeadings = normalized.split(/\n(?=#{1,6}[ \t])/)
  const flat: string[] = []
  for (const part of byHeadings) {
    for (const sub of part.split(/\n---\s*\n/)) {
      const t = sub.trim()
      if (t) flat.push(t)
    }
  }
  return flat.length ? flat : [normalized]
}

/**
 * Character-level chunking with overlap (legacy / fallback).
 */
function splitByCharacters(text: string): string[] {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return []

  const chunks: string[] = []
  let start = 0
  while (start < normalized.length && chunks.length < MAX_CHUNKS_PER_DOCUMENT) {
    const end = Math.min(start + CHUNK_TARGET_CHARS, normalized.length)
    let slice = normalized.slice(start, end)
    if (end < normalized.length) {
      const lastBreak = Math.max(
        slice.lastIndexOf('\n\n'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf(' '),
      )
      if (lastBreak > CHUNK_TARGET_CHARS * 0.4) {
        slice = slice.slice(0, lastBreak + 1).trim()
      }
    }
    if (slice.length > 0) chunks.push(slice)
    const nextStart = end - CHUNK_OVERLAP_CHARS
    start = nextStart <= start ? end : nextStart
  }
  return chunks
}

/**
 * Split plain text or markdown into overlapping chunks for embedding.
 * @param markdown When true, split on headings / --- first, then sub-chunk large sections.
 */
export function splitIntoChunks(text: string, options?: { markdown?: boolean }): string[] {
  if (!options?.markdown) {
    return splitByCharacters(text)
  }

  const sections = splitMarkdownSections(text)
  const out: string[] = []

  for (const section of sections) {
    if (out.length >= MAX_CHUNKS_PER_DOCUMENT) break
    if (section.length <= CHUNK_TARGET_CHARS) {
      out.push(section)
      continue
    }
    const sub = splitByCharacters(section)
    for (const c of sub) {
      if (out.length >= MAX_CHUNKS_PER_DOCUMENT) break
      out.push(c)
    }
  }

  return out.slice(0, MAX_CHUNKS_PER_DOCUMENT)
}
