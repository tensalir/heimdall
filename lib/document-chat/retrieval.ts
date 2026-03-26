import { createHash } from 'crypto'
import { getSupabase } from '../supabase.js'
import { embedQuery } from './embed.js'

export interface DocumentChatMatch {
  id: string
  document_id: string
  collection_id: string
  chunk_index: number
  content: string
  filename: string
  collection_slug: string
  context_json: Record<string, unknown> | null
  similarity: number
}

export interface MatchDocumentChatParams {
  query: string
  matchCount?: number
  similarityThreshold?: number
  collectionId?: string | null
  collectionSlug?: string | null
}

export async function matchDocumentChatChunks(params: MatchDocumentChatParams): Promise<DocumentChatMatch[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  const embedding = await embedQuery(params.query)
  if (!embedding) return []

  const { data, error } = await supabase.rpc('match_document_chat_chunks', {
    query_embedding: embedding,
    match_count: params.matchCount ?? 12,
    similarity_threshold: params.similarityThreshold ?? 0.22,
    filter_collection_id: params.collectionId ?? null,
    filter_collection_slug: params.collectionSlug ?? null,
  })
  if (error) return []
  return (data ?? []) as DocumentChatMatch[]
}

export function sha256ContentHash(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex').slice(0, 64)
}

export interface DocumentChatGraphRow {
  entity_id: string
  entity_name: string
  entity_type: string
  entity_description: string | null
  neighbor_entity_id: string
  neighbor_name: string
  neighbor_type: string
  relation_type: string
  evidence_chunk_id: string | null
}

export async function searchDocumentChatGraph(params: {
  query: string
  collectionId?: string | null
  collectionSlug?: string | null
  maxEntities?: number
  maxRelations?: number
}): Promise<DocumentChatGraphRow[]> {
  const supabase = getSupabase()
  if (!supabase) return []
  if (!params.collectionId && !params.collectionSlug) return []

  const { data, error } = await supabase.rpc('search_document_chat_graph', {
    search_query: params.query,
    filter_collection_id: params.collectionId ?? null,
    filter_collection_slug: params.collectionSlug ?? null,
    max_entities: params.maxEntities ?? 12,
    max_relations: params.maxRelations ?? 40,
  })
  if (error) return []
  return (data ?? []) as DocumentChatGraphRow[]
}
