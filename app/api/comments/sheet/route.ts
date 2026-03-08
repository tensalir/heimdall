import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import {
  getFile,
  getFileComments,
  hasFigmaReadAccess,
  type FigmaComment,
} from '@/src/integrations/figma/restClient'
import { getSupabase, type DbComment } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// ── Types ────────────────────────────────────────────────────────

interface FigmaTreeNode {
  id: string
  name: string
  type: string
  children?: FigmaTreeNode[]
}

export interface EnrichedComment {
  id: string
  orderNumber: number | null
  author: string
  authorAvatar: string
  message: string
  createdAt: string
  resolvedAt: string | null
  status: 'open' | 'resolved'
  threadDepth: number
  replyCount: number
  parentId: string | null
}

export interface CommentLayer {
  nodeId: string | null
  nodeName: string
  thumbnailUrl: string | null
  comments: EnrichedComment[]
}

export interface CommentPageTab {
  pageId: string
  pageName: string
  layers: CommentLayer[]
  commentCount: number
  openCount: number
  resolvedCount: number
}

export interface CommentSheetData {
  fileName: string
  fileKey: string
  pages: CommentPageTab[]
  syncedFromCache: boolean
}

// ── Figma helpers ────────────────────────────────────────────────

function enrichComment(
  c: FigmaComment,
  byId: Map<string, FigmaComment>,
  replyCounts: Map<string, number>
): EnrichedComment {
  let d = 0
  let current = c
  while (current.parent_id && byId.has(current.parent_id)) {
    d++
    current = byId.get(current.parent_id)!
  }
  return {
    id: c.id,
    orderNumber: c.order_id,
    author: c.user.handle,
    authorAvatar: c.user.img_url,
    message: c.message,
    createdAt: c.created_at,
    resolvedAt: c.resolved_at,
    status: c.resolved_at ? 'resolved' : 'open',
    threadDepth: d,
    replyCount: replyCounts.get(c.id) ?? 0,
    parentId: c.parent_id,
  }
}

function resolveCommentNodeId(
  c: FigmaComment,
  byId: Map<string, FigmaComment>
): string | null {
  if (c.parent_id && byId.has(c.parent_id)) {
    let root = byId.get(c.parent_id)!
    while (root.parent_id && byId.has(root.parent_id)) {
      root = byId.get(root.parent_id)!
    }
    return root.client_meta?.node_id ?? c.client_meta?.node_id ?? null
  }
  return c.client_meta?.node_id ?? null
}

function sortCommentThreads(comments: EnrichedComment[]): EnrichedComment[] {
  const topLevel = comments
    .filter((c) => c.threadDepth === 0)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  const replies = comments.filter((c) => c.threadDepth > 0)
  const byParent = new Map<string, EnrichedComment[]>()
  for (const r of replies) {
    if (!r.parentId) continue
    if (!byParent.has(r.parentId)) byParent.set(r.parentId, [])
    byParent.get(r.parentId)!.push(r)
  }
  for (const [, group] of byParent) {
    group.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }
  const result: EnrichedComment[] = []
  for (const tl of topLevel) {
    result.push(tl)
    result.push(...(byParent.get(tl.id) ?? []))
  }
  return result
}

function buildNodeToPageMap(doc: FigmaTreeNode): Map<string, string> {
  const map = new Map<string, string>()
  for (const page of doc.children ?? []) {
    if (page.type !== 'CANVAS') continue
    map.set(page.id, page.id)
    const walk = (node: FigmaTreeNode) => {
      map.set(node.id, page.id)
      for (const child of node.children ?? []) walk(child)
    }
    walk(page)
  }
  return map
}

// ── Build response from enriched comments with page info ─────────

function buildSheetResponse(
  fileName: string,
  fileKey: string,
  comments: (EnrichedComment & { pageId: string; pageName: string; nodeId: string | null; nodeName: string })[],
  syncedFromCache: boolean
): CommentSheetData {
  // Collect page ordering
  const pageOrder: string[] = []
  const pageNames = new Map<string, string>()
  for (const c of comments) {
    if (!pageNames.has(c.pageId)) {
      pageNames.set(c.pageId, c.pageName)
      pageOrder.push(c.pageId)
    }
  }

  // Group by page -> layer
  const commentsByPage = new Map<string, Map<string, { nodeName: string; comments: EnrichedComment[] }>>()

  for (const c of comments) {
    const pid = c.pageId
    if (!commentsByPage.has(pid)) commentsByPage.set(pid, new Map())
    const layers = commentsByPage.get(pid)!
    const layerKey = c.nodeId ?? '__canvas__'
    if (!layers.has(layerKey)) layers.set(layerKey, { nodeName: c.nodeName, comments: [] })
    layers.get(layerKey)!.comments.push(c)
  }

  const pages: CommentPageTab[] = []

  for (const pid of pageOrder) {
    const layerMap = commentsByPage.get(pid)
    if (!layerMap || layerMap.size === 0) continue

    const layers: CommentLayer[] = []
    for (const [layerKey, bucket] of layerMap) {
      layers.push({
        nodeId: layerKey === '__canvas__' ? null : layerKey,
        nodeName: bucket.nodeName,
        thumbnailUrl: null,
        comments: sortCommentThreads(bucket.comments),
      })
    }
    layers.sort((a, b) => b.comments.length - a.comments.length)

    const commentCount = layers.reduce((s, l) => s + l.comments.length, 0)
    pages.push({
      pageId: pid,
      pageName: pageNames.get(pid) ?? pid,
      layers,
      commentCount,
      openCount: layers.reduce((s, l) => s + l.comments.filter((c) => c.status === 'open').length, 0),
      resolvedCount: layers.reduce((s, l) => s + l.comments.filter((c) => c.status === 'resolved').length, 0),
    })
  }

  pages.sort((a, b) => {
    if (a.pageId === '__other__') return 1
    if (b.pageId === '__other__') return -1
    return b.commentCount - a.commentCount
  })

  return { fileName, fileKey, pages, syncedFromCache }
}

// ── Supabase persistence helpers ─────────────────────────────────

async function loadFromSupabase(fileKey: string) {
  const sb = getSupabase()
  if (!sb) return null

  const { data: fileMeta } = await sb
    .from('comment_files')
    .select('file_name, last_synced_at, total_comments')
    .eq('file_key', fileKey)
    .single()

  if (!fileMeta) return null

  const { data: rows } = await sb
    .from('comments')
    .select('*')
    .eq('file_key', fileKey)
    .order('created_at', { ascending: true })

  if (!rows || rows.length === 0) return null

  return {
    fileName: fileMeta.file_name as string,
    lastSyncedAt: fileMeta.last_synced_at as string,
    totalComments: fileMeta.total_comments as number,
    comments: rows as DbComment[],
  }
}

function dbToEnriched(row: DbComment): EnrichedComment & { pageId: string; pageName: string; nodeId: string | null; nodeName: string } {
  return {
    id: row.id,
    orderNumber: row.order_number,
    author: row.author,
    authorAvatar: row.author_avatar,
    message: row.message,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    status: row.resolved_at ? 'resolved' : 'open',
    threadDepth: row.thread_depth,
    replyCount: row.reply_count,
    parentId: row.parent_id,
    pageId: row.page_id,
    pageName: row.page_name,
    nodeId: row.node_id,
    nodeName: row.node_name,
  }
}

async function storeToSupabase(
  fileKey: string,
  fileName: string,
  enrichedComments: (EnrichedComment & { pageId: string; pageName: string; nodeId: string | null; nodeName: string })[]
) {
  const sb = getSupabase()
  if (!sb) return

  // Upsert the file record
  await sb.from('comment_files').upsert({
    file_key: fileKey,
    file_name: fileName,
    last_synced_at: new Date().toISOString(),
    total_comments: enrichedComments.length,
  })

  // Upsert comments in batches of 100
  const rows: DbComment[] = enrichedComments.map((c) => ({
    id: c.id,
    file_key: fileKey,
    page_id: c.pageId,
    page_name: c.pageName,
    node_id: c.nodeId,
    node_name: c.nodeName,
    parent_id: c.parentId,
    order_number: c.orderNumber,
    author: c.author,
    author_avatar: c.authorAvatar,
    message: c.message,
    created_at: c.createdAt,
    resolved_at: c.resolvedAt,
    thread_depth: c.threadDepth,
    reply_count: c.replyCount,
  }))

  for (let i = 0; i < rows.length; i += 100) {
    await sb.from('comments').upsert(rows.slice(i, i + 100))
  }
}

// ── Full Figma fetch + enrichment ────────────────────────────────

async function fullFigmaFetch(fileKey: string) {
  const [rawComments, fileMeta] = await Promise.all([
    getFileComments(fileKey, { asMarkdown: true }),
    getFile(fileKey),
  ])

  if (!fileMeta || !fileMeta.document) {
    throw new Error('Could not fetch file metadata')
  }

  const fileName = fileMeta.name
  const doc = fileMeta.document as unknown as FigmaTreeNode

  const pageMap = new Map<string, string>()
  const pageOrder: string[] = []
  for (const page of (doc.children ?? []) as FigmaTreeNode[]) {
    if (page.type !== 'CANVAS') continue
    pageMap.set(page.id, page.name)
    pageOrder.push(page.id)
  }

  const nodeToPage = buildNodeToPageMap(doc)

  const byId = new Map<string, FigmaComment>()
  for (const c of rawComments) byId.set(c.id, c)

  const replyCounts = new Map<string, number>()
  for (const c of rawComments) {
    if (c.parent_id) {
      replyCounts.set(c.parent_id, (replyCounts.get(c.parent_id) ?? 0) + 1)
    }
  }

  type FullComment = EnrichedComment & { pageId: string; pageName: string; nodeId: string | null; nodeName: string }
  const enrichedComments: FullComment[] = []

  for (const c of rawComments) {
    const enriched = enrichComment(c, byId, replyCounts)
    const nodeId = resolveCommentNodeId(c, byId)
    const resolvedPageId = nodeId ? nodeToPage.get(nodeId) : undefined
    const pageId = resolvedPageId ?? '__other__'
    const pageName = pageMap.get(pageId) ?? 'All Comments'

    let nodeName = 'Canvas'
    if (nodeId && pageMap.has(nodeId)) {
      nodeName = `${pageMap.get(nodeId)} (page)`
    } else if (nodeId) {
      nodeName = `Layer ${nodeId}`
    }

    enrichedComments.push({ ...enriched, pageId, pageName, nodeId, nodeName })
  }

  return { fileName, enrichedComments, rawIds: new Set(rawComments.map((c) => c.id)) }
}

// ── Route Handler ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error
  const fileKey = new URL(req.url).searchParams.get('fileKey')
  if (!fileKey) {
    return NextResponse.json({ error: 'Missing required query param: fileKey' }, { status: 400 })
  }
  if (!hasFigmaReadAccess()) {
    return NextResponse.json({ error: 'No FIGMA_ACCESS_TOKEN configured' }, { status: 503 })
  }

  try {
    // Step 1: Check Supabase cache
    const cached = await loadFromSupabase(fileKey)

    // Step 2: Fetch current comments from Figma (fast — just comment JSON)
    const rawComments = await getFileComments(fileKey, { asMarkdown: true })
    const figmaIds = new Set(rawComments.map((c) => c.id))

    // Step 3: Compare — any new or changed comments?
    if (cached && cached.comments.length > 0) {
      const cachedIds = new Set(cached.comments.map((c) => c.id))
      const newIds = [...figmaIds].filter((id) => !cachedIds.has(id))

      // Check for resolved_at changes
      const cachedById = new Map(cached.comments.map((c) => [c.id, c]))
      const changedIds: string[] = []
      for (const fc of rawComments) {
        const cc = cachedById.get(fc.id)
        if (cc && ((fc.resolved_at ?? null) !== (cc.resolved_at ?? null))) {
          changedIds.push(fc.id)
        }
      }

      const hasChanges = newIds.length > 0 || changedIds.length > 0

      if (!hasChanges) {
        // No changes — return from cache directly (skip file tree fetch)
        const enriched = cached.comments.map(dbToEnriched)
        const result = buildSheetResponse(cached.fileName, fileKey, enriched, true)
        return NextResponse.json(result)
      }
    }

    // Step 4: Changes found (or no cache) — full fetch + store
    const { fileName, enrichedComments } = await fullFigmaFetch(fileKey)
    
    // Store to Supabase in background (don't block response)
    storeToSupabase(fileKey, fileName, enrichedComments).catch((e) => {
      console.error('[Heimdall] Failed to persist comments to Supabase:', e)
    })

    const result = buildSheetResponse(fileName, fileKey, enrichedComments, false)
    return NextResponse.json(result)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
