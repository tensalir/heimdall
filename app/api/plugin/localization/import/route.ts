import { brokerRoute, relay } from '@/lib/localization-broker'

/**
 * POST /api/plugin/localization/import — import a filled agency workbook.
 * The workbook travels base64-encoded in the JSON body because the signature
 * covers the raw body text; binary could not be verified byte-for-byte.
 */
export const POST = brokerRoute(async ({ body, babylon }) => {
  return relay(await babylon('POST', '/api/localization/plugin/import', JSON.stringify(body)))
})
