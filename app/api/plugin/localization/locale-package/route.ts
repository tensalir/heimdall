import { NextResponse } from 'next/server'
import { brokerRoute, relay } from '@/lib/localization-broker'

/**
 * GET /api/plugin/localization/locale-package?runId=…&langs=nl,fr-ca
 *
 * Returns the raw node-id -> translated-text map. The plugin applies it with
 * the Figma Plugin API directly, so no executable script crosses the wire.
 */
export const GET = brokerRoute(async ({ query, babylon }) => {
  const runId = query.get('runId')?.trim()
  if (!runId) {
    return NextResponse.json({ error: 'runId query parameter is required' }, { status: 400 })
  }
  const params = new URLSearchParams({ runId })
  const langs = query.get('langs')?.trim()
  if (langs) params.set('langs', langs)
  return relay(await babylon('GET', `/api/localization/plugin/locale-package?${params.toString()}`))
})
