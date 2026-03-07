/**
 * Ad creative memory: Voyage embeddings + Supabase pgvector for pattern recall.
 * Reuses the same Voyage v3.5 (1024-d) model and pgvector extension as the
 * evidence RAG stack (see lib/evidenceClient.ts), but targets the
 * ad_creative_embeddings table for ad-specific similarity retrieval.
 */

import { getSupabase } from './supabase.js'
import { getQueryEmbedding } from './evidenceClient.js'

export interface AdEmbeddingRow {
  id: string
  source_item_id: string
  embedding_text: string
  page_name: string | null
  content_style: string | null
  quality_status: string | null
  similarity: number
}

export async function embedAdCreative(text: string): Promise<number[] | null> {
  return getQueryEmbedding(text)
}

export async function upsertAdEmbedding(
  sourceItemId: string,
  embeddingText: string,
  embedding: number[],
  meta?: { page_name?: string; content_style?: string; quality_status?: string },
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const { createHash } = await import('crypto')
  const contentHash = createHash('sha256').update(embeddingText).digest('hex').slice(0, 16)

  const { error } = await db.from('ad_creative_embeddings').upsert(
    {
      source_item_id: sourceItemId,
      embedding_text: embeddingText,
      content_hash: contentHash,
      embedding: embedding as unknown as string,
      page_name: meta?.page_name ?? null,
      content_style: meta?.content_style ?? null,
      quality_status: meta?.quality_status ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'source_item_id' },
  )
  return !error
}

export async function findSimilarAds(
  query: string,
  opts?: {
    matchCount?: number
    threshold?: number
    qualityStatus?: string
    contentStyle?: string
  },
): Promise<AdEmbeddingRow[]> {
  const db = getSupabase()
  if (!db) return []
  const embedding = await getQueryEmbedding(query)
  if (!embedding) return []

  const { data, error } = await db.rpc('match_ad_creatives', {
    query_embedding: embedding as unknown as string,
    match_count: opts?.matchCount ?? 10,
    similarity_threshold: opts?.threshold ?? 0.3,
    filter_quality_status: opts?.qualityStatus ?? null,
    filter_content_style: opts?.contentStyle ?? null,
  })
  if (error) return []
  return (data ?? []) as AdEmbeddingRow[]
}

export function isAdMemoryAvailable(): boolean {
  return !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_KEY &&
    process.env.VOYAGE_API_KEY
  )
}
