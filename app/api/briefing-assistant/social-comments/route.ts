import { NextRequest, NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/social-comments?q=...
 * Returns social-comment-type source items.
 */
export async function GET(req: NextRequest) {
  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ comments: [] })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get('q')?.trim() || null

  let query = db
    .from('briefing_source_items')
    .select('id, title, preview, body_text, platform, link_url, tags, created_at, raw_data')
    .eq('source_type', 'social_comment')
    .order('created_at', { ascending: false })
    .limit(100)

  if (q) query = query.ilike('body_text', `%${q}%`)

  const { data, error } = await query
  if (error) {
    return NextResponse.json({ comments: [] })
  }

  const comments = (data ?? []).map((row: Record<string, unknown>) => {
    const raw = (row.raw_data ?? {}) as Record<string, unknown>
    return {
      id: row.id,
      platform: row.platform ?? 'unknown',
      author: raw.author as string | null ?? null,
      text: row.body_text ?? row.preview ?? '',
      sentiment: (raw.sentiment as string) ?? 'neutral',
      engagement_count: raw.engagement_count as number | null ?? null,
      source_url: row.link_url,
      captured_at: row.created_at,
      tags: row.tags ?? [],
    }
  })

  return NextResponse.json({ comments })
}
