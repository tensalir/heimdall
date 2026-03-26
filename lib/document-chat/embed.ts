import { EMBED_DIM, EMBED_MODEL, VOYAGE_EMBED_API } from './constants.js'

async function voyageEmbed(inputs: string[], inputType: 'document' | 'query'): Promise<number[][] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  const res = await fetch(VOYAGE_EMBED_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      input: inputs.length === 1 ? inputs[0]! : inputs,
      model: EMBED_MODEL,
      input_type: inputType,
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { data?: Array<{ embedding: number[] }> }
  const rows = data.data
  if (!rows?.length) return null
  const out: number[][] = []
  for (const row of rows) {
    const emb = row.embedding
    if (!emb || emb.length !== EMBED_DIM) return null
    out.push(emb)
  }
  return out
}

export async function embedQuery(query: string): Promise<number[] | null> {
  const batch = await voyageEmbed([query], 'query')
  return batch?.[0] ?? null
}

/** Batch document embeddings (Voyage supports multiple inputs per request). */
export async function embedDocuments(chunks: string[]): Promise<number[][] | null> {
  if (chunks.length === 0) return []
  const batchSize = 16
  const all: number[][] = []
  for (let i = 0; i < chunks.length; i += batchSize) {
    const slice = chunks.slice(i, i + batchSize)
    const emb = await voyageEmbed(slice, 'document')
    if (!emb || emb.length !== slice.length) return null
    all.push(...emb)
  }
  return all
}

export function isDocumentChatEmbeddingConfigured(): boolean {
  return !!(process.env.VOYAGE_API_KEY && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
}
