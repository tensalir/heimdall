/**
 * POST /api/creative-memory/analyze
 *
 * Actions:
 *   ?action=run-evals      — run the eval suite (dry-run or full)
 *   ?action=run-analysis    — run pending fingerprint analysis
 *   (default)              — analyze a single image URL
 *
 * Auth: privileged (Supabase session)
 */

import { NextRequest, NextResponse } from 'next/server'
import { requirePrivilegedUser } from '@/lib/route-auth'

export const maxDuration = 300

export async function POST(req: NextRequest) {
  const auth = await requirePrivilegedUser(req)
  if (auth.error) return auth.error

  const body = await req.json().catch(() => ({}))
  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action')

  if (action === 'run-evals') {
    const { runEvalSuite } = await import('@/src/creativeMemory/evals/runner')
    const dryRun = (body as { dryRun?: boolean }).dryRun ?? true
    const filterType = (body as { filterType?: string }).filterType
    const limit = (body as { limit?: number }).limit
    const results = await runEvalSuite({ dryRun, filterType, limit })
    return NextResponse.json({ results, count: results.length })
  }

  if (action === 'run-analysis') {
    const { runPendingAnalysis } = await import('@/src/creativeMemory/ingest')
    const batchSize = (body as { batchSize?: number }).batchSize ?? 5
    const result = await runPendingAnalysis(batchSize)
    return NextResponse.json(result)
  }

  // Default: analyze a single image
  const imageUrl = (body as { imageUrl?: string }).imageUrl
  if (!imageUrl) {
    return NextResponse.json({ error: 'imageUrl required' }, { status: 400 })
  }

  const { analyzeAdImage } = await import('@/src/creativeMemory/fingerprint')
  const context = body as { product?: string; useCase?: string; familyName?: string }

  const result = await analyzeAdImage(
    { url: imageUrl },
    { product: context.product, useCase: context.useCase, familyName: context.familyName },
  )

  return NextResponse.json(result)
}
