import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import { TOPICS } from '@/src/services/socialListeningDiscoveryService'

export const dynamic = 'force-dynamic'

function extractDateFromText(text: string | null): string | null {
  if (!text) return null
  const match = text.match(/Time Posted \(UTC\):\s*(\d{4}-\d{2}-\d{2}[\sT]\d{2}:\d{2}:\d{2}[^\n]*)/)
  if (match) {
    try {
      const d = new Date(match[1].trim())
      if (!isNaN(d.getTime())) return d.toISOString()
    } catch { /* ignore */ }
  }
  return null
}

/**
 * GET /api/briefing-assistant/social-comments?q=...&topic=...&sinceWeeks=4&sort=relevance
 * Returns social-comment-type source items with filtering, sorting, and topic metadata.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null
  const topic = searchParams.get('topic')?.trim() || null
  const sinceWeeks = parseInt(searchParams.get('sinceWeeks') ?? '8', 10) || 8
  const sort = searchParams.get('sort') ?? 'recent'

  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - sinceWeeks * 7)

  let query = db
    .from('briefing_source_items')
    .select('id, title, preview, body_text, thumbnail_url, platform, link_url, tags, created_at, started_at, raw_data')
    .eq('source_type', 'social_comment')
    .not('external_id', 'like', 'social-digest-%')
    .gte('created_at', sinceDate.toISOString())
    .limit(80)

  if (q) query = query.or(`body_text.ilike.%${q}%,title.ilike.%${q}%`)
  if (topic) query = query.contains('tags', [topic])

  if (sort === 'relevance') {
    query = query.order('created_at', { ascending: false })
  } else {
    query = query.order('created_at', { ascending: false })
  }

  const { data, error } = await query
  if (error) {
    console.error('[SocialComments] List query failed:', error.message)
    return NextResponse.json({ error: 'Failed to load social comments' }, { status: 500 })
  }

  let comments = (data ?? []).map((row: Record<string, unknown>) => {
    const raw = (row.raw_data ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      title: row.title ?? '',
      thumbnail: row.thumbnail_url ?? null,
      platform: row.platform ?? 'unknown',
      author: (raw.author as string | null) ?? null,
      subreddit: (raw.subreddit as string | null) ?? null,
      text: (row.body_text ?? row.preview ?? '') as string,
      sentiment: (raw.sentiment as string) ?? 'neutral',
      relevance_score: (raw.relevance_score as number) ?? null,
      authenticity_score: (raw.authenticity_score as number) ?? null,
      creative_angles: (raw.creative_angles as string[]) ?? [],
      language_hooks: (raw.language_hooks as string[]) ?? [],
      highlights: (raw.highlights as string[]) ?? [],
      engagement_count: (raw.engagement_count as number | null) ?? null,
      source_url: row.link_url,
      captured_at: row.created_at,
      published_at: (row.started_at as string | null) ?? extractDateFromText(row.body_text as string | null),
      tags: row.tags ?? [],
    }
  })

  if (sort === 'relevance') {
    comments = comments.sort(
      (a: { relevance_score: number | null }, b: { relevance_score: number | null }) =>
        (b.relevance_score ?? 0) - (a.relevance_score ?? 0),
    )
  }

  return NextResponse.json({
    comments,
    topics: TOPICS.map((t) => ({ id: t.id, label: t.label })),
  })
}
