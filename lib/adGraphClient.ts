/**
 * Knowledge graph client for ad creative patterns.
 * Manages nodes (brands, hooks, styles, etc.) and edges (co-occurrence, similarity).
 * Backed by ad_graph_nodes / ad_graph_edges in Supabase.
 */

import { getSupabase } from './supabase.js'

export type NodeType =
  | 'brand'
  | 'hook_type'
  | 'content_style'
  | 'offer_type'
  | 'emotion'
  | 'format'
  | 'use_case'
  | 'proof_type'
  | 'creator_style'

export type EdgeType = 'ad_has' | 'co_occurs' | 'similar_to' | 'brand_uses' | 'pattern'

export interface GraphNode {
  id: string
  node_type: NodeType
  node_key: string
  label: string
  metadata: Record<string, unknown>
  ad_count: number
}

export interface GraphEdge {
  id: string
  source_node_id: string
  target_node_id: string
  edge_type: EdgeType
  source_item_id: string | null
  weight: number
  metadata: Record<string, unknown>
}

async function ensureNode(
  nodeType: NodeType,
  nodeKey: string,
  label?: string,
): Promise<string | null> {
  const db = getSupabase()
  if (!db) return null

  const normalizedKey = nodeKey.toLowerCase().replace(/\s+/g, '_')
  const displayLabel = label ?? nodeKey.replace(/_/g, ' ')

  const { data, error } = await db
    .from('ad_graph_nodes')
    .upsert(
      {
        node_type: nodeType,
        node_key: normalizedKey,
        label: displayLabel,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'node_type,node_key' },
    )
    .select('id')
    .single()

  if (error || !data) return null
  return data.id as string
}

async function addEdge(
  sourceNodeId: string,
  targetNodeId: string,
  edgeType: EdgeType,
  sourceItemId?: string | null,
  weight = 1.0,
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const { error } = await db.from('ad_graph_edges').upsert(
    {
      source_node_id: sourceNodeId,
      target_node_id: targetNodeId,
      edge_type: edgeType,
      source_item_id: sourceItemId ?? null,
      weight,
    },
    { onConflict: 'source_node_id,target_node_id,edge_type,source_item_id' },
  )
  return !error
}

/**
 * Index an ad's semantic tags into the knowledge graph.
 * Creates brand, hook, style, etc. nodes and links them via edges.
 */
export async function indexAdInGraph(
  sourceItemId: string,
  tags: {
    page_name?: string | null
    page_id?: string | null
    hook_type?: string | null
    content_style_tags?: string[]
    proof_type?: string | null
    creator_style?: string | null
    media_type?: string | null
    target_market?: string | null
  },
): Promise<void> {
  const db = getSupabase()
  if (!db) return

  const nodeIds: string[] = []

  if (tags.page_name && tags.page_id) {
    const brandId = await ensureNode('brand', tags.page_id, tags.page_name)
    if (brandId) nodeIds.push(brandId)
  }

  if (tags.hook_type) {
    const hookId = await ensureNode('hook_type', tags.hook_type)
    if (hookId) nodeIds.push(hookId)
  }

  for (const style of tags.content_style_tags ?? []) {
    const styleId = await ensureNode('content_style', style)
    if (styleId) nodeIds.push(styleId)
  }

  if (tags.proof_type && tags.proof_type !== 'none') {
    const proofId = await ensureNode('proof_type', tags.proof_type)
    if (proofId) nodeIds.push(proofId)
  }

  if (tags.creator_style) {
    const creatorId = await ensureNode('creator_style', tags.creator_style)
    if (creatorId) nodeIds.push(creatorId)
  }

  if (tags.media_type) {
    const formatId = await ensureNode('format', tags.media_type)
    if (formatId) nodeIds.push(formatId)
  }

  for (const nodeId of nodeIds) {
    await addEdge(nodeId, nodeId, 'ad_has', sourceItemId)
  }

  for (let i = 0; i < nodeIds.length; i++) {
    for (let j = i + 1; j < nodeIds.length; j++) {
      await addEdge(nodeIds[i], nodeIds[j], 'co_occurs', sourceItemId)
    }
  }

  await incrementNodeCounts(nodeIds)
}

async function incrementNodeCounts(nodeIds: string[]): Promise<void> {
  const db = getSupabase()
  if (!db || nodeIds.length === 0) return

  for (const id of nodeIds) {
    const { count } = await db
      .from('ad_graph_edges')
      .select('id', { count: 'exact', head: true })
      .eq('source_node_id', id)
      .eq('edge_type', 'ad_has')

    await db
      .from('ad_graph_nodes')
      .update({ ad_count: count ?? 0, updated_at: new Date().toISOString() })
      .eq('id', id)
  }
}

export async function getRelatedNodes(
  nodeType: NodeType,
  nodeKey: string,
  limit = 10,
): Promise<GraphNode[]> {
  const db = getSupabase()
  if (!db) return []

  const normalizedKey = nodeKey.toLowerCase().replace(/\s+/g, '_')

  const { data: sourceNode } = await db
    .from('ad_graph_nodes')
    .select('id')
    .eq('node_type', nodeType)
    .eq('node_key', normalizedKey)
    .single()

  if (!sourceNode) return []

  const { data: edges } = await db
    .from('ad_graph_edges')
    .select('target_node_id, weight')
    .eq('source_node_id', sourceNode.id)
    .eq('edge_type', 'co_occurs')
    .order('weight', { ascending: false })
    .limit(limit)

  if (!edges?.length) return []

  const targetIds = edges.map((e: { target_node_id: string }) => e.target_node_id)
  const { data: nodes } = await db
    .from('ad_graph_nodes')
    .select('*')
    .in('id', targetIds)

  return (nodes ?? []) as GraphNode[]
}

export async function getTopPatterns(
  nodeType: NodeType,
  limit = 20,
): Promise<GraphNode[]> {
  const db = getSupabase()
  if (!db) return []

  const { data } = await db
    .from('ad_graph_nodes')
    .select('*')
    .eq('node_type', nodeType)
    .order('ad_count', { ascending: false })
    .limit(limit)

  return (data ?? []) as GraphNode[]
}
