import { brokerRoute, relay } from '@/lib/localization-broker'

/** POST /api/plugin/localization/sheet — create or reuse a localization workspace. */
export const POST = brokerRoute(async ({ body, babylon }) => {
  return relay(await babylon('POST', '/api/localization/plugin/sheet', JSON.stringify(body)))
})
