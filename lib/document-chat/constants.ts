/** Supabase Storage bucket for original files (private). */
export const DOCUMENT_CHAT_BUCKET = 'document-chat'

/** Default chunking for retrieval quality vs token cost. */
export const CHUNK_TARGET_CHARS = 1200
export const CHUNK_OVERLAP_CHARS = 150

/** Per-file limit for synchronous ingest on serverless (bytes). */
export const MAX_UPLOAD_BYTES = 12 * 1024 * 1024

/** Safety cap on chunks per document. */
export const MAX_CHUNKS_PER_DOCUMENT = 400

export const VOYAGE_EMBED_API = 'https://api.voyageai.com/v1/embeddings'
export const EMBED_MODEL = 'voyage-3.5'
export const EMBED_DIM = 1024
