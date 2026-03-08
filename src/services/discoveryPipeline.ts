/**
 * Shared discovery pipeline for trend and social-listening services.
 *
 * Both services follow the same flow:
 *   1. Taxonomy lookup (vertical/topic)
 *   2. Exa search with category-specific queries
 *   3. Anthropic batch scoring with category-specific prompts
 *   4. Dedup + persist to briefing_source_items
 *   5. Perplexity digest synthesis
 *
 * This module extracts the shared scaffolding so each service
 * only needs to provide its taxonomy, prompts, and row mappers.
 */

import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '../../lib/supabase.js'

export interface DiscoveryCategory {
  id: string
  label: string
  description: string
  queries: string[]
  synthesisPrompt: string
}

export interface ExaResult {
  exaId: string
  title: string
  url: string
  text: string
  publishedDate: string | null
  highlights: string[]
  image: string | null
  author: string | null
}

export interface ScoringResult {
  index: number
  relevance_score: number
  [key: string]: unknown
}

export interface PersistConfig {
  sourceType: string
  categoryKey: string
  scoringSystemPrompt: string
  buildScoringPrompt: (items: ExaResult[]) => string
  mapToRow: (item: ExaResult, scores: ScoringResult) => Record<string, unknown>
  qualityFilter?: (item: ExaResult, scores: ScoringResult) => boolean
}

/**
 * Batch score items using Anthropic, then dedup and persist to the database.
 */
export async function batchScoreAndPersist(
  items: ExaResult[],
  config: PersistConfig,
): Promise<{ scored: number; persisted: number }> {
  if (items.length === 0) return { scored: 0, persisted: 0 }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const db = getSupabase()
  if (!db) throw new Error('Database not configured')

  const client = new Anthropic({ apiKey })
  const allScored: Array<{ item: ExaResult; scores: ScoringResult }> = []

  const BATCH_SIZE = 10
  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const batch = items.slice(i, i + BATCH_SIZE)
    const prompt = config.buildScoringPrompt(batch)

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: config.scoringSystemPrompt,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : '[]'

      let jsonStr = rawText
      const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeMatch) jsonStr = codeMatch[1].trim()

      const results = JSON.parse(jsonStr) as ScoringResult[]

      for (const result of results) {
        const item = batch[result.index - 1]
        if (!item) continue
        allScored.push({ item, scores: result })
      }
    } catch (err) {
      console.error(`[DiscoveryPipeline] Scoring failed:`, err)
      for (const item of batch) {
        allScored.push({
          item,
          scores: { index: 0, relevance_score: 50 },
        })
      }
    }
  }

  const qualifying = config.qualityFilter
    ? allScored.filter(({ item, scores }) => config.qualityFilter!(item, scores))
    : allScored

  const existingCheck = await db
    .from('briefing_source_items')
    .select('external_id')
    .eq('source_type', config.sourceType)
    .in('external_id', qualifying.map(({ item }) => item.exaId))

  const existingIds = new Set(
    (existingCheck.data ?? []).map((r: { external_id: string }) => r.external_id),
  )

  const newItems = qualifying.filter(({ item }) => !existingIds.has(item.exaId))

  if (newItems.length > 0) {
    const rows = newItems.map(({ item, scores }) => config.mapToRow(item, scores))
    const { error } = await db.from('briefing_source_items').insert(rows)
    if (error) {
      console.error(`[DiscoveryPipeline] DB insert failed:`, error)
    }
  }

  return { scored: allScored.length, persisted: newItems.length }
}

/**
 * Synthesize a digest using the Perplexity API.
 */
export async function synthesizeDigestShared(params: {
  sourceType: string
  categoryId: string
  category: DiscoveryCategory
  contextBuilder: (items: Array<Record<string, unknown>>) => string
}): Promise<{ digest: string; citations: string[]; generatedAt: string } | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  const db = getSupabase()
  if (!db) return null

  const { data: recentItems } = await db
    .from('briefing_source_items')
    .select('title, preview, link_url, platform, raw_data')
    .eq('source_type', params.sourceType)
    .contains('tags', [params.categoryId])
    .order('created_at', { ascending: false })
    .limit(20)

  const contextBlock = params.contextBuilder(recentItems ?? [])

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are a creative strategist for Loop Earplugs. Return well-structured analysis with clear headers and actionable takeaways.',
          },
          {
            role: 'user',
            content: `${params.category.synthesisPrompt}\n\nContext from our database:\n${contextBlock}`,
          },
        ],
        max_tokens: 1500,
        return_citations: true,
      }),
    })

    if (!response.ok) return null

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>
      citations?: string[]
    }

    const digest = data.choices?.[0]?.message?.content ?? ''
    const citations = data.citations ?? []

    if (!digest) return null

    const result = {
      digest,
      citations,
      generatedAt: new Date().toISOString(),
    }

    await db.from('briefing_source_items').upsert(
      {
        source_type: params.sourceType,
        external_id: `${params.sourceType === 'trend' ? 'digest' : 'social-digest'}-${params.categoryId}`,
        title: `${params.category.label} Digest`,
        preview: digest.slice(0, 300),
        body_text: digest,
        platform: 'perplexity',
        tags: [params.categoryId, 'digest'],
        is_active: true,
        raw_data: { citations, generatedAt: result.generatedAt },
      },
      { onConflict: 'source_type,external_id' },
    )

    return result
  } catch (err) {
    console.error(`[DiscoveryPipeline] Digest synthesis failed:`, err)
    return null
  }
}
