import { brokerRoute, relay } from '@/lib/localization-broker'

/**
 * POST /api/plugin/localization/extract — extract one page/tab.
 * Babylon defaults to its fast path (~5s); send { force: true } afterwards to
 * run the AI refinement passes on the same run.
 */
export const POST = brokerRoute(async ({ body, babylon }) => {
  return relay(await babylon('POST', '/api/localization/plugin/extract', JSON.stringify(body)))
})
