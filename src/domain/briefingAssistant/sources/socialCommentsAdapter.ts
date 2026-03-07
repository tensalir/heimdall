/**
 * Social comments evidence adapter.
 * Retrieves live social listening data from Supabase (social_comment records)
 * and normalizes to EvidenceSnippet for angle generation.
 */

import type { EvidenceSourceAdapter } from './types.js'
import type { EvidenceSnippet } from '../angleContext.js'
import type { EvidenceFilter } from './types.js'
import { getSupabase } from '@/lib/supabase.js'

const SOURCE_ID = 'social_comments'

export const socialCommentsAdapter: EvidenceSourceAdapter = {
  sourceId: SOURCE_ID,

  async getEvidence(filter: EvidenceFilter): Promise<EvidenceSnippet[]> {
    const limit = filter.limit ?? 20
    const since = filter.since ?? undefined

    const db = getSupabase()
    if (!db) {
      return getStaticFallback(filter.productOrUseCase).slice(0, limit)
    }

    try {
      let query = db
        .from('briefing_source_items')
        .select('id, title, preview, body_text, link_url, tags, created_at, started_at, raw_data')
        .eq('source_type', 'social_comment')
        .not('external_id', 'like', 'social-digest-%')
        .order('created_at', { ascending: false })
        .limit(limit)

      if (since) {
        query = query.gte('created_at', since)
      }

      if (filter.tags && filter.tags.length > 0) {
        query = query.contains('tags', filter.tags)
      }

      const { data, error } = await query
      if (error || !data || data.length === 0) {
        return getStaticFallback(filter.productOrUseCase).slice(0, limit)
      }

      return data.map((row: Record<string, unknown>) => {
        const raw = (row.raw_data ?? {}) as Record<string, unknown>
        const subreddit = raw.subreddit as string | null
        const hooks = (raw.language_hooks as string[]) ?? []

        const textContent = (row.body_text ?? row.preview ?? '') as string
        const snippetText = hooks.length > 0
          ? `${hooks[0]} — ${textContent.slice(0, 200)}`
          : textContent.slice(0, 300)

        return {
          id: row.id as string,
          text: snippetText,
          source: SOURCE_ID,
          recency: ((row.started_at ?? row.created_at) as string)?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
          provenance: subreddit ? `Reddit r/${subreddit}` : 'Reddit',
          tags: (row.tags as string[]) ?? [],
        }
      })
    } catch {
      return getStaticFallback(filter.productOrUseCase).slice(0, limit)
    }
  },
}

function getStaticFallback(productOrUseCase?: string): EvidenceSnippet[] {
  const base: EvidenceSnippet[] = [
    {
      id: 'social-1',
      text: 'Bundles get a lot of "gift idea" and "stocking stuffer" mentions in Q4.',
      source: SOURCE_ID,
      recency: new Date().toISOString().slice(0, 10),
      provenance: 'Social listening',
      tags: ['bundles', 'tof'],
    },
    {
      id: 'social-2',
      text: 'Switch messaging resonates when tied to "multiple environments" and versatility.',
      source: SOURCE_ID,
      recency: new Date().toISOString().slice(0, 10),
      provenance: 'Comment analysis',
      tags: ['switch', 'bau'],
    },
  ]
  if (productOrUseCase) {
    const q = productOrUseCase.toLowerCase()
    return base.filter((s) => s.tags?.some((t) => t.includes(q))) || base
  }
  return base
}
