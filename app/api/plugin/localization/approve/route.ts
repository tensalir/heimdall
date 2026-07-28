import { brokerRoute, relay } from '@/lib/localization-broker'

/** POST /api/plugin/localization/approve — promote a run's translations to approved. */
export const POST = brokerRoute(async ({ body, babylon }) => {
  return relay(await babylon('POST', '/api/localization/plugin/approve', JSON.stringify(body)))
})
