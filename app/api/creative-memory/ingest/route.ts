/**
 * POST /api/creative-memory/ingest
 *
 * Triggers ingestion of a Frontify folder into the creative memory.
 * Scans for image assets, groups ratio siblings, and stores metadata.
 *
 * Auth: privileged (Supabase session)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { IngestFolderRequestSchema } from '@/src/creativeMemory/types'
import { ingestFolder, runPendingAnalysis } from '@/src/creativeMemory/ingest'

export const maxDuration = 120

export async function POST(req: NextRequest) {
  const auth = await requirePrivilegedUser(req)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({}))
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'analyze') {
    const batchSize = Number(body.batchSize) || 5
    const result = await runPendingAnalysis(batchSize)
    return NextResponse.json(result)
  }

  const parsed = IngestFolderRequestSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', details: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const result = await ingestFolder(parsed.data)
  return NextResponse.json(result)
}
