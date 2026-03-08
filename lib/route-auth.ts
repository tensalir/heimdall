/**
 * Shared route-level auth helpers.
 *
 * Classifies API routes into policy groups and provides reusable
 * guards that fail closed when auth is not configured.
 */

import { NextResponse } from 'next/server.js'
import { createSupabaseRouteClient } from './supabase-auth.js'

export type RoutePolicy = 'public' | 'user' | 'admin' | 'machine' | 'webhook'

/**
 * Require an authenticated Supabase user on a route handler.
 * Returns { user, supabase } on success, or a 401 NextResponse.
 */
export async function requireUser(request: Request) {
  const { supabase } = createSupabaseRouteClient(request)
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: 'Authentication not configured' },
        { status: 503 },
      ),
    }
  }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return {
      error: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      ),
    }
  }

  return { user, supabase }
}

/**
 * Require a valid machine secret on webhook/cron/plugin routes.
 * Checks the X-Heimdall-Secret header against HEIMDALL_MACHINE_SECRET.
 * Falls back to allowing requests when the secret is not yet configured
 * (compatibility stage 1), but logs a warning.
 */
export function requireMachineAuth(request: Request): { error?: NextResponse } {
  const secret = process.env.HEIMDALL_MACHINE_SECRET
  if (!secret) {
    console.warn('[route-auth] HEIMDALL_MACHINE_SECRET not configured — machine route is unprotected')
    return {}
  }

  const provided = request.headers.get('x-heimdall-secret')
  if (!provided || provided !== secret) {
    return {
      error: NextResponse.json(
        { error: 'Machine authentication required' },
        { status: 403 },
      ),
    }
  }

  return {}
}

const WEBHOOK_PATHS = [
  '/api/webhooks/',
]

const MACHINE_PATHS = [
  '/api/jobs/',
  '/api/plugin/',
  '/api/briefing-assistant/trends/discover',
  '/api/briefing-assistant/social-comments/discover',
]

const PUBLIC_PATHS = [
  '/api/auth/',
  '/api/health',
]

/**
 * Classify an API route pathname into a policy group.
 */
export function classifyApiRoute(pathname: string): RoutePolicy {
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return 'public'
  if (WEBHOOK_PATHS.some((p) => pathname.startsWith(p))) return 'webhook'
  if (MACHINE_PATHS.some((p) => pathname.startsWith(p))) return 'machine'
  return 'user'
}
