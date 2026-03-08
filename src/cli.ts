/**
 * CLI entry: start Heimdall HTTP server.
 *
 * @deprecated This standalone server is superseded by the Next.js App Router
 * at `app/api/`. All webhook, job, and plugin endpoints now live there.
 * The `dev:backend` script and this entry point will be removed in a future
 * release once all external callers have migrated to the Next.js surface.
 */

import 'dotenv/config'
import { startServer } from './api/server.js'

console.warn('[Heimdall] src/cli.ts is deprecated — use `npm run dev` (Next.js) instead.')
startServer()
