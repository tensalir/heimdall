/**
 * Wrapper for the `/api/plugin/localization/*` broker routes.
 *
 * Middleware classifies these as 'user_token' and only checks that a bearer
 * header is PRESENT — resolving it there would mean a database lookup on the
 * Edge for every request. The real check is `requirePluginUser`, so a handler
 * that forgets it is effectively unauthenticated. Routing all of them through
 * this wrapper makes the check structural rather than something each author
 * has to remember, and a test asserts no route exports a bare handler.
 */

import { NextResponse } from 'next/server.js'
import { requirePluginUser } from './route-auth.js'
import { callBabylonPlugin, type BabylonResponse } from './babylon-plugin-client.js'

export interface BrokerContext {
  request: Request
  /** Supabase auth user id the plugin token belongs to. */
  userId: string
  /** Parsed JSON body, or `{}` for GET/empty-body requests. */
  body: Record<string, unknown>
  query: URLSearchParams
  /** Call a Babylon plugin route with a valid HMAC signature. */
  babylon: typeof callBabylonPlugin
}

/** Relay a Babylon response, preserving JSON vs binary and the status code. */
export function relay(res: BabylonResponse): NextResponse {
  if (res.bytes) {
    return new NextResponse(res.bytes, {
      status: res.status,
      headers: { 'Content-Type': res.contentType || 'application/octet-stream' },
    })
  }
  return NextResponse.json(res.json ?? { error: 'Empty response from Babylon' }, { status: res.status })
}

export function brokerRoute(
  handler: (ctx: BrokerContext) => Promise<NextResponse>,
): (request: Request) => Promise<NextResponse> {
  return async (request: Request) => {
    const auth = await requirePluginUser(request)
    if (auth.error) return auth.error

    let body: Record<string, unknown> = {}
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      try {
        const parsed: unknown = await request.json()
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          body = parsed as Record<string, unknown>
        }
      } catch {
        return NextResponse.json({ error: 'Body is not valid JSON' }, { status: 400 })
      }
    }

    try {
      return await handler({
        request,
        userId: auth.userId,
        body,
        query: new URL(request.url).searchParams,
        babylon: callBabylonPlugin,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }
}
