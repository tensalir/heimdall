/**
 * Knowledge-graph extraction from chunks using Claude tool use.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { SupabaseClient } from '@supabase/supabase-js'

const MODEL = 'claude-sonnet-4-20250514'
const TOOL_NAME = 'emit_document_graph'

const kgTool = {
  name: TOOL_NAME,
  description:
    'Emit named entities and directed relations extracted ONLY from the provided text. Use concise entity_type labels (e.g. product, person, team, policy, concept, location, organization).',
  input_schema: {
    type: 'object',
    properties: {
      entities: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Canonical name as it appears in context' },
            entity_type: { type: 'string' },
            description: { type: 'string', description: 'Optional short gloss' },
          },
          required: ['name', 'entity_type'],
        },
      },
      relations: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            subject: { type: 'string', description: 'Subject entity name (must match an entity name)' },
            predicate: {
              type: 'string',
              description: 'Relation in snake_case, e.g. applies_to, part_of, managed_by',
            },
            object: { type: 'string', description: 'Object entity name' },
            object_entity_type: { type: 'string', description: 'Type of object if new' },
          },
          required: ['subject', 'predicate', 'object'],
        },
      },
    },
    required: ['entities', 'relations'],
  },
} as const

function normalizeEntityName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').slice(0, 500)
}

function normalizeEntityType(t: string): string {
  return t.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80) || 'concept'
}

function normalizePredicate(p: string): string {
  return p.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 120) || 'related_to'
}

export interface KgChunkRow {
  id: string
  content: string
}

export async function extractKgFromChunk(
  chunkText: string,
  filename: string,
): Promise<{
  entities: Array<{ name: string; entity_type: string; description?: string }>
  relations: Array<{
    subject: string
    predicate: string
    object: string
    object_entity_type?: string
  }>
}> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { entities: [], relations: [] }
  }

  const client = new Anthropic({ apiKey })
  const user = `Source file: ${filename}\n\nExtract entities and relations from this passage only. Do not invent facts not stated in the text.\n\n---\n${chunkText}\n---`

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4096,
    tools: [kgTool as never],
    tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: user }],
  })

  const toolUse = msg.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
  if (!toolUse || toolUse.name !== TOOL_NAME) {
    return { entities: [], relations: [] }
  }

  const input = toolUse.input as {
    entities?: Array<{ name?: string; entity_type?: string; description?: string }>
    relations?: Array<{
      subject?: string
      predicate?: string
      object?: string
      object_entity_type?: string
    }>
  }

  const entities = (input.entities ?? [])
    .filter((e) => e.name && e.entity_type)
    .map((e) => ({
      name: normalizeEntityName(e.name!),
      entity_type: normalizeEntityType(e.entity_type!),
      description: e.description?.trim().slice(0, 2000) || undefined,
    }))
    .filter((e) => e.name.length > 0)

  const relations = (input.relations ?? [])
    .filter((r) => r.subject && r.predicate && r.object)
    .map((r) => ({
      subject: normalizeEntityName(r.subject!),
      predicate: normalizePredicate(r.predicate!),
      object: normalizeEntityName(r.object!),
      object_entity_type: r.object_entity_type
        ? normalizeEntityType(r.object_entity_type)
        : undefined,
    }))
    .filter((r) => r.subject.length > 0 && r.object.length > 0)

  return { entities, relations }
}

async function getOrCreateEntityId(
  supabase: SupabaseClient,
  collectionId: string,
  name: string,
  entityType: string,
  description?: string | null,
): Promise<string | null> {
  const n = normalizeEntityName(name)
  const t = normalizeEntityType(entityType)
  if (!n) return null

  const { data: existing } = await supabase
    .from('document_chat_entities')
    .select('id')
    .eq('collection_id', collectionId)
    .eq('name', n)
    .eq('entity_type', t)
    .maybeSingle()

  if (existing?.id) return existing.id

  const { data: inserted, error } = await supabase
    .from('document_chat_entities')
    .insert({
      collection_id: collectionId,
      name: n,
      entity_type: t,
      description: description ?? null,
    })
    .select('id')
    .single()

  if (error) {
    if (error.code === '23505') {
      const { data: again } = await supabase
        .from('document_chat_entities')
        .select('id')
        .eq('collection_id', collectionId)
        .eq('name', n)
        .eq('entity_type', t)
        .maybeSingle()
      return again?.id ?? null
    }
    console.warn('[kg-extract] entity insert', error.message)
    return null
  }
  return inserted?.id ?? null
}

/**
 * Persist KG for one chunk: upsert entities, insert relations with evidence link.
 */
export async function persistKgForChunk(
  supabase: SupabaseClient,
  collectionId: string,
  evidenceChunkId: string,
  filename: string,
  chunkContent: string,
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) return

  const { entities, relations } = await extractKgFromChunk(chunkContent, filename)

  for (const e of entities) {
    await getOrCreateEntityId(supabase, collectionId, e.name, e.entity_type, e.description ?? null)
  }

  for (const r of relations) {
    const subjEnt = entities.find((e) => e.name === r.subject)
    const objEnt = entities.find((e) => e.name === r.object)
    const subjType = subjEnt?.entity_type ?? 'concept'
    const objType = objEnt?.entity_type ?? r.object_entity_type ?? 'concept'

    const sid = await getOrCreateEntityId(supabase, collectionId, r.subject, subjType)
    const oid = await getOrCreateEntityId(supabase, collectionId, r.object, objType)
    if (!sid || !oid) continue

    const { error: relErr } = await supabase.from('document_chat_relations').insert({
      collection_id: collectionId,
      source_entity_id: sid,
      target_entity_id: oid,
      relation_type: r.predicate,
      evidence_chunk_id: evidenceChunkId,
      confidence: 0.75,
    })
    if (relErr) {
      console.warn('[kg-extract] relation insert', relErr.message)
    }
  }
}

/**
 * Run KG extraction for many chunks (sequential to limit rate).
 */
export async function persistKgForDocumentChunks(
  supabase: SupabaseClient,
  collectionId: string,
  filename: string,
  chunks: KgChunkRow[],
): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY || chunks.length === 0) return

  for (const ch of chunks) {
    await persistKgForChunk(supabase, collectionId, ch.id, filename, ch.content)
    await new Promise((r) => setTimeout(r, 120))
  }
}

export async function pruneOrphanEntities(
  supabase: SupabaseClient,
  collectionId: string,
): Promise<void> {
  const { error } = await supabase.rpc('document_chat_prune_orphan_entities', {
    p_collection_id: collectionId,
  })
  if (error) console.warn('[kg-extract] prune orphans', error.message)
}
