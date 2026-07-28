import { NextResponse } from 'next/server'
import { brokerRoute, relay } from '@/lib/localization-broker'

/**
 * GET /api/plugin/localization/pack?projectId=… — download the agency workbook.
 * Returns .xlsx bytes, so `relay` passes them through unparsed.
 */
export const GET = brokerRoute(async ({ query, babylon }) => {
  const projectId = query.get('projectId')?.trim()
  const fileKey = query.get('fileKey')?.trim()
  const batchId = query.get('batchId')?.trim()
  if (!projectId && !fileKey && !batchId) {
    return NextResponse.json(
      { error: 'projectId, fileKey, or batchId query parameter is required' },
      { status: 400 },
    )
  }
  // Rebuild the query rather than forwarding it verbatim: the signature covers
  // the path AND query, so unexpected params would break verification.
  const params = new URLSearchParams()
  if (projectId) params.set('projectId', projectId)
  else if (fileKey) params.set('fileKey', fileKey)
  else if (batchId) params.set('batchId', batchId)
  return relay(await babylon('GET', `/api/localization/plugin/pack?${params.toString()}`))
})
