import { NextRequest, NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

/**
 * GET /api/briefing-assistant/discovery-jobs?type=...&status=...&id=...
 * Poll job status. Returns most recent job of given type, or specific job by id.
 */
export async function GET(req: NextRequest) {
  const auth = await requireUser(req); if (auth.error) return auth.error
  const db = getSupabase()
  if (!db) return NextResponse.json({ error: 'Database not configured' }, { status: 500 })

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('id')
  const jobType = searchParams.get('type')

  if (jobId) {
    const { data: job } = await db
      .from('briefing_discovery_jobs')
      .select('*')
      .eq('id', jobId)
      .single()
    return NextResponse.json({ job: job ?? null })
  }

  if (jobType) {
    const { data: jobs } = await db
      .from('briefing_discovery_jobs')
      .select('*')
      .eq('job_type', jobType)
      .order('created_at', { ascending: false })
      .limit(1)
    return NextResponse.json({ job: jobs?.[0] ?? null })
  }

  const { data: jobs } = await db
    .from('briefing_discovery_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  return NextResponse.json({ jobs: jobs ?? [] })
}
