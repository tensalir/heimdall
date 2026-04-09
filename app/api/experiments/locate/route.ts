import { NextResponse } from 'next/server'
import { getProjectFiles, getFile } from '@/src/integrations/figma/restClient'

const DEFAULT_PROJECT_ID = '387033831'
const DEFAULT_MONDAY_BOARD_ID = '18404406006'
const MONDAY_API_URL = 'https://api.monday.com/v2'
const RATE_LIMIT_DELAY_MS = 500

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export interface LocateResultItem {
  experimentName: string
  found: boolean
  fileKey: string | null
  fileName: string | null
  pageId: string | null
  pageName: string | null
  figmaUrl: string | null
  matchType?: 'monday' | 'exact' | 'id_prefix' | 'fuzzy'
  mondayItemId?: string | null
}

// ─── Helpers ───

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** Extract short experiment ID (e.g. JU38, GAIN13, SB102, T5PM7) */
function extractShortId(name: string): string | null {
  const m = name.match(/E?EXP[-.]?([A-Z]+\d+)/i)
  return m ? m[1].toUpperCase() : null
}

function extractExperimentId(name: string): string | null {
  const m = name.match(/^(E?EXP[-.]?[A-Z0-9]+)/i)
  return m ? m[1].toUpperCase() : null
}

function levenshtein(a: string, b: string): number {
  const an = a.length
  const bn = b.length
  const dp: number[][] = Array(an + 1)
  for (let i = 0; i <= an; i++) dp[i] = Array(bn + 1).fill(0)
  for (let i = 0; i <= an; i++) dp[i]![0] = i
  for (let j = 0; j <= bn; j++) dp[0]![j] = j
  for (let i = 1; i <= an; i++) {
    for (let j = 1; j <= bn; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      dp[i]![j] = Math.min(dp[i - 1]![j]! + 1, dp[i]![j - 1]! + 1, dp[i - 1]![j - 1]! + cost)
    }
  }
  return dp[an]![bn]!
}

interface PageInfo {
  fileKey: string
  fileName: string
  pageId: string
  pageName: string
}

function buildFigmaPageUrl(fileKey: string, pageId: string): string {
  const nodeId = pageId.replace(':', '-')
  return `https://www.figma.com/design/${fileKey}/?node-id=${nodeId}`
}

/** Parse a Figma URL into { fileKey, nodeId } */
function parseFigmaUrl(url: string): { fileKey: string; nodeId: string | null } | null {
  // https://www.figma.com/design/FILEKEY/NAME?node-id=123-456...
  // https://www.figma.com/file/FILEKEY/NAME?node-id=123:456...
  const m = url.match(/figma\.com\/(?:design|file)\/([A-Za-z0-9]+)/)
  if (!m) return null
  const fileKey = m[1]
  const nodeMatch = url.match(/node[-_]id=([0-9]+[-:][0-9]+)/)
  const nodeId = nodeMatch ? nodeMatch[1].replace('-', ':') : null
  return { fileKey, nodeId }
}

// ─── Monday lookup ───

interface MondayItem {
  id: string
  name: string
  column_values: Array<{ id: string; text: string; value: string; type: string }>
}

async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) return null
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2025-04' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) return null
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  return json.data ?? null
}

async function getMondayBoardItems(boardId: string): Promise<MondayItem[]> {
  const allItems: MondayItem[] = []
  let cursor: string | null = null

  const firstPage = await mondayQuery<{
    boards: Array<{ items_page: { cursor: string | null; items: MondayItem[] } }>
  }>(`query ($boardId: [ID!]!) {
    boards(ids: $boardId) {
      items_page(limit: 500) {
        cursor
        items { id name column_values { id text value type } }
      }
    }
  }`, { boardId: [boardId] })

  const board = firstPage?.boards?.[0]
  if (!board) return []
  allItems.push(...(board.items_page.items ?? []))
  cursor = board.items_page.cursor

  while (cursor) {
    const next = await mondayQuery<{
      next_items_page: { cursor: string | null; items: MondayItem[] }
    }>(`query ($cursor: String!) {
      next_items_page(cursor: $cursor, limit: 500) {
        cursor
        items { id name column_values { id text value type } }
      }
    }`, { cursor })
    if (!next?.next_items_page) break
    allItems.push(...(next.next_items_page.items ?? []))
    cursor = next.next_items_page.cursor
  }

  return allItems
}

function findFigmaUrlInItem(item: MondayItem): string | null {
  for (const col of item.column_values) {
    const text = (col.text ?? '').trim()
    if (text.includes('figma.com')) return text
    if (col.value?.includes?.('figma.com')) {
      try {
        const parsed = JSON.parse(col.value)
        if (typeof parsed === 'string' && parsed.includes('figma.com')) return parsed
        if (parsed?.url && String(parsed.url).includes('figma.com')) return parsed.url
        if (parsed?.text && String(parsed.text).includes('figma.com')) return parsed.text
      } catch { /* not JSON */ }
    }
  }
  return null
}

// ─── Main handler ───

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as {
      experimentNames?: string[]
      projectId?: string
      mondayBoardId?: string
    }
    const experimentNames = body.experimentNames ?? []
    const projectId = (body.projectId ?? DEFAULT_PROJECT_ID).toString().trim()
    const mondayBoardId = (body.mondayBoardId ?? process.env.MONDAY_BOARD_ID ?? DEFAULT_MONDAY_BOARD_ID).toString().trim()

    if (experimentNames.length === 0) {
      return NextResponse.json({ error: 'experimentNames (array) is required' }, { status: 400, headers: CORS_HEADERS })
    }

    // ── Phase 1: Monday lookup (fast, gives direct Figma URLs) ──
    const results: LocateResultItem[] = experimentNames.map((name) => ({
      experimentName: name,
      found: false,
      fileKey: null,
      fileName: null,
      pageId: null,
      pageName: null,
      figmaUrl: null,
      mondayItemId: null,
    }))

    let mondayItems: MondayItem[] = []
    try {
      mondayItems = await getMondayBoardItems(mondayBoardId)
    } catch (err) {
      console.warn('[locate] Monday fetch failed, falling back to Figma-only:', err)
    }

    if (mondayItems.length > 0) {
      // Build lookup by short ID (e.g. "JU38" -> items)
      const byShortId = new Map<string, MondayItem[]>()
      for (const item of mondayItems) {
        const sid = extractShortId(item.name)
        if (sid) {
          const arr = byShortId.get(sid) ?? []
          arr.push(item)
          byShortId.set(sid, arr)
        }
      }

      for (let i = 0; i < results.length; i++) {
        const expName = results[i].experimentName
        const shortId = extractShortId(expName)
        if (!shortId) continue

        const candidates = byShortId.get(shortId) ?? []
        const match = candidates.length === 1
          ? candidates[0]
          : candidates.find((c) => normalize(c.name).includes(normalize(expName).slice(0, 20))) ?? candidates[0]

        if (!match) continue

        const figmaUrlRaw = findFigmaUrlInItem(match)
        if (figmaUrlRaw) {
          // Extract clean URL (may have "Figma - " prefix)
          const urlMatch = figmaUrlRaw.match(/(https:\/\/[^\s]+figma\.com[^\s]*)/)
          const cleanUrl = urlMatch ? urlMatch[1] : figmaUrlRaw
          const parsed = parseFigmaUrl(cleanUrl)

          if (parsed) {
            results[i] = {
              experimentName: expName,
              found: true,
              fileKey: parsed.fileKey,
              fileName: null, // will be enriched in phase 2 if needed
              pageId: parsed.nodeId,
              pageName: match.name,
              figmaUrl: cleanUrl,
              matchType: 'monday',
              mondayItemId: match.id,
            }
            continue
          }
        }

        // Monday matched but no Figma URL — mark the Monday item ID so Figma scan can help
        results[i].mondayItemId = match.id
        results[i].pageName = match.name
      }
    }

    // ── Phase 2: Figma project scan (for experiments not yet resolved) ──
    const unresolvedIndices = results
      .map((r, i) => (!r.found ? i : -1))
      .filter((i) => i >= 0)

    if (unresolvedIndices.length > 0) {
      const allPages: PageInfo[] = []
      try {
        const files = await getProjectFiles(projectId)
        for (const f of files) {
          await new Promise((r) => setTimeout(r, RATE_LIMIT_DELAY_MS))
          try {
            const meta = await getFile(f.key, { depth: 1 })
            if (!meta?.document || !('children' in meta.document)) continue
            const children = (meta.document as { children?: Array<{ id: string; name?: string }> }).children
            if (!Array.isArray(children)) continue
            for (const page of children) {
              if (!page?.id) continue
              allPages.push({
                fileKey: f.key,
                fileName: f.name,
                pageId: page.id,
                pageName: page.name ?? '',
              })
            }
          } catch (err) {
            console.warn(`[locate] Skipping file ${f.key} (${f.name}):`, err instanceof Error ? err.message : err)
          }
        }
      } catch (err) {
        console.warn('[locate] Figma project scan failed:', err)
      }

      // Also try to resolve Monday-matched experiments that had no Figma URL
      // by matching their pageName against Figma pages
      for (const idx of unresolvedIndices) {
        const r = results[idx]
        const expName = r.experimentName
        const pageName = r.pageName ?? expName
        const norm = normalize(pageName)
        const expId = extractExperimentId(expName)

        // 1. Exact normalized match
        let best = allPages.find((p) => normalize(p.pageName) === norm)
        let matchType: 'exact' | 'id_prefix' | 'fuzzy' | undefined = best ? 'exact' : undefined

        // Also try matching against the original experiment name
        if (!best) {
          const normExp = normalize(expName)
          best = allPages.find((p) => normalize(p.pageName) === normExp)
          if (best) matchType = 'exact'
        }

        // 2. Short ID match
        if (!best && expId) {
          const idNorm = expId.replace(/[-.]/g, '')
          const candidates = allPages.filter((p) => {
            const pn = normalize(p.pageName).replace(/[-.\s]/g, '')
            return pn.includes(idNorm)
          })
          if (candidates.length === 1) {
            best = candidates[0]
            matchType = 'id_prefix'
          } else if (candidates.length > 1) {
            best = candidates.find((p) => normalize(p.pageName).startsWith(norm.slice(0, 15))) ?? candidates[0]
            matchType = 'id_prefix'
          }
        }

        // 3. Levenshtein
        if (!best) {
          let minDist = 4
          for (const p of allPages) {
            const d = levenshtein(norm, normalize(p.pageName))
            if (d < minDist) { minDist = d; best = p; matchType = 'fuzzy' }
          }
        }

        if (best) {
          results[idx] = {
            ...r,
            found: true,
            fileKey: best.fileKey,
            fileName: best.fileName,
            pageId: best.pageId,
            pageName: best.pageName,
            figmaUrl: buildFigmaPageUrl(best.fileKey, best.pageId),
            matchType,
          }
        }
      }
    }

    // Enrich Monday-resolved results that are missing fileName
    // (optional, skip API call — just note it came from Monday)
    for (const r of results) {
      if (r.found && !r.fileName && r.fileKey) {
        r.fileName = '(via Monday)'
      }
    }

    const mondayResolved = results.filter((r) => r.matchType === 'monday').length
    const figmaResolved = results.filter((r) => r.found && r.matchType !== 'monday').length

    return NextResponse.json(
      { results, meta: { mondayResolved, figmaResolved, total: experimentNames.length } },
      { status: 200, headers: CORS_HEADERS }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500, headers: CORS_HEADERS }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export const dynamic = 'force-dynamic'
