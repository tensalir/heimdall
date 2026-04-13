/**
 * Creative Memory — storage and retrieval service.
 *
 * Writes embeddings, reads creative context packs for Iterator planners.
 * Uses the same Voyage embedding + pgvector pattern as lib/adCreativeMemory.ts
 * but targets the creative_memory_embeddings table for first-party ads.
 */

import { getSupabase } from '../../lib/supabase'
import { getQueryEmbedding } from '../../lib/evidenceClient'
import type {
  CreativeEmbeddingRow,
  CreativeContextCard,
  CreativeContextPack,
  VisualFingerprint,
  CanonicalRatio,
} from './types.js'

// ---------------------------------------------------------------------------
// Embedding writes
// ---------------------------------------------------------------------------

/**
 * Embed a retrieval summary and upsert into creative_memory_embeddings.
 */
export async function embedCreativeMemory(
  familyId: string,
  assetId: string | null,
  embeddingText: string,
  meta: {
    product: string | null
    useCase: string | null
    compositionArchetype: string | null
    paletteMood: string | null
  },
): Promise<boolean> {
  const db = getSupabase()
  if (!db) return false

  const embedding = await getDocumentEmbedding(embeddingText)
  if (!embedding) return false

  const { createHash } = await import('crypto')
  const contentHash = createHash('sha256').update(embeddingText).digest('hex').slice(0, 16)

  const { error } = await db.from('creative_memory_embeddings').upsert(
    {
      family_id: familyId,
      asset_id: assetId,
      embedding_text: embeddingText,
      content_hash: contentHash,
      embedding: embedding as unknown as string,
      product: meta.product,
      use_case: meta.useCase,
      composition_archetype: meta.compositionArchetype,
      palette_mood: meta.paletteMood,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'family_id,asset_id' },
  )

  if (error) {
    console.error('[creative-memory] embedCreativeMemory failed:', error.message)
  }
  return !error
}

// ---------------------------------------------------------------------------
// Embedding reads (retrieval)
// ---------------------------------------------------------------------------

/**
 * Find similar creative references by semantic query.
 * Supports optional metadata filters for hybrid retrieval.
 */
export async function findSimilarCreatives(
  query: string,
  opts?: {
    matchCount?: number
    threshold?: number
    product?: string
    useCase?: string
    archetype?: string
    mood?: string
  },
): Promise<CreativeEmbeddingRow[]> {
  const db = getSupabase()
  if (!db) return []

  const embedding = await getQueryEmbedding(query)
  if (!embedding) return []

  const { data, error } = await db.rpc('match_creative_memory', {
    query_embedding: embedding as unknown as string,
    match_count: opts?.matchCount ?? 10,
    similarity_threshold: opts?.threshold ?? 0.3,
    filter_product: opts?.product ?? null,
    filter_use_case: opts?.useCase ?? null,
    filter_archetype: opts?.archetype ?? null,
    filter_mood: opts?.mood ?? null,
  })

  if (error) {
    console.error('[creative-memory] findSimilarCreatives failed:', error.message)
    return []
  }

  return (data ?? []) as CreativeEmbeddingRow[]
}

/**
 * Build a full creative context pack for an Iterator request.
 * This is the primary runtime interface: query -> compressed reference cards.
 */
export async function buildCreativeContextPack(
  query: string,
  opts?: {
    maxReferences?: number
    product?: string
    useCase?: string
    ratio?: CanonicalRatio
    archetype?: string
  },
): Promise<CreativeContextPack> {
  const maxRefs = opts?.maxReferences ?? 6
  const embeddingRows = await findSimilarCreatives(query, {
    matchCount: maxRefs * 2, // over-fetch for reranking headroom
    product: opts?.product,
    useCase: opts?.useCase,
    archetype: opts?.archetype,
  })

  if (embeddingRows.length === 0) {
    return { references: [], patternSummary: 'No similar creatives found in memory.', query }
  }

  const db = getSupabase()
  if (!db) {
    return { references: [], patternSummary: 'Database unavailable.', query }
  }

  // Hydrate with asset details and fingerprints
  const cards: CreativeContextCard[] = []

  for (const row of embeddingRows.slice(0, maxRefs)) {
    let fingerprint: VisualFingerprint | null = null
    let thumbnailUrl: string | null = null
    let ratio: CanonicalRatio = '4x5'
    let familyName = ''

    // Load family name
    const { data: family } = await db
      .from('creative_families')
      .select('family_name, product')
      .eq('id', row.family_id)
      .single()

    if (family) {
      familyName = family.family_name as string
    }

    // Load asset details if we have an asset_id
    if (row.asset_id) {
      const { data: asset } = await db
        .from('creative_assets')
        .select('ratio, fingerprint, thumbnail_url, download_url')
        .eq('id', row.asset_id)
        .single()

      if (asset) {
        ratio = (asset.ratio as CanonicalRatio) ?? '4x5'
        thumbnailUrl = (asset.thumbnail_url as string) ?? (asset.download_url as string) ?? null
        if (asset.fingerprint) {
          try {
            fingerprint = (typeof asset.fingerprint === 'string'
              ? JSON.parse(asset.fingerprint as string)
              : asset.fingerprint) as VisualFingerprint
          } catch { /* skip malformed fingerprints */ }
        }
      }
    }

    // Filter by ratio if requested
    if (opts?.ratio && ratio !== opts.ratio) continue

    cards.push({
      familyName,
      product: row.product,
      ratio,
      fingerprint: fingerprint ?? createEmptyFingerprint(),
      retrievalSummary: row.embedding_text,
      thumbnailUrl,
      similarity: row.similarity,
    })
  }

  const patternSummary = summarizePatterns(cards)

  return { references: cards, patternSummary, query }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Generate a document embedding via Voyage (asymmetric: document type).
 * Uses the same Voyage API as getQueryEmbedding but with input_type=document.
 */
async function getDocumentEmbedding(text: string): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      input: text,
      model: 'voyage-3.5',
      input_type: 'document',
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
  const emb = data.data?.[0]?.embedding
  if (!emb || emb.length !== 1024) return null
  return emb
}

function createEmptyFingerprint(): VisualFingerprint {
  return {
    compositionArchetype: 'other',
    copyPlacement: 'other',
    backgroundTreatment: 'other',
    productRole: 'other',
    proofMechanism: 'none',
    ctaPattern: 'other',
    layoutDensity: 'moderate',
    paletteMood: 'neutral',
    storySubject: '',
    protectedRegions: [],
    dominantColors: [],
    antiPatterns: [],
    reusabilityNotes: '',
  }
}

function summarizePatterns(cards: CreativeContextCard[]): string {
  if (cards.length === 0) return 'No patterns available.'

  const archetypes = new Map<string, number>()
  const moods = new Map<string, number>()
  const densities = new Map<string, number>()

  for (const card of cards) {
    const a = card.fingerprint.compositionArchetype
    archetypes.set(a, (archetypes.get(a) ?? 0) + 1)
    const m = card.fingerprint.paletteMood
    moods.set(m, (moods.get(m) ?? 0) + 1)
    const d = card.fingerprint.layoutDensity
    densities.set(d, (densities.get(d) ?? 0) + 1)
  }

  const topArchetype = [...archetypes.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed'
  const topMood = [...moods.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'mixed'
  const topDensity = [...densities.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'moderate'

  return `${cards.length} similar creatives found. Dominant pattern: ${topArchetype} composition, ${topMood} palette, ${topDensity} density.`
}

/**
 * Check if creative memory retrieval is available.
 */
export function isCreativeMemoryAvailable(): boolean {
  return !!(
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_KEY &&
    process.env.VOYAGE_API_KEY
  )
}
