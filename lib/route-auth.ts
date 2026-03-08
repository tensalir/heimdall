/**
 * Shared route-level auth helpers.
 *
 * Classifies API routes into policy groups and provides reusable
 * guards that fail closed when auth is not configured.
 */

import { NextResponse } from 'next/server.js'
import { createSupabaseRouteClient } from './supabase-auth.js'

export type RoutePolicy = 'public' | 'user' | 'machine' | 'webhook' | 'dual'

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

const WEBHOOK_PREFIXES = [
  '/api/webhooks/',
]

const MACHINE_PREFIXES = [
  '/api/jobs/',
  '/api/plugin/',
]

const DUAL_AUTH_PREFIXES = [
  '/api/briefing-assistant/trends/discover',
  '/api/briefing-assistant/social-comments/discover',
]

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/briefing-assistant/auth',
  '/api/sheets/auth',
  '/api/images/proxy',
]

/**
 * Classify an API route pathname into a policy group.
 * Single source of truth — consumed by middleware.ts and tests.
 */
export function classifyApiRoute(pathname: string): RoutePolicy {
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return 'public'
  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return 'webhook'
  if (MACHINE_PREFIXES.some((p) => pathname.startsWith(p))) return 'machine'
  if (DUAL_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) return 'dual'
  return 'user'
}
