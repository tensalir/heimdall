/**
 * Shared route-level auth helpers.
 *
 * Classifies API routes into policy groups and provides reusable
 * guards that fail closed when auth is not configured.
 */

import { NextResponse } from 'next/server.js'
import { createSupabaseRouteClient } from './supabase-auth.js'
import { resolvePluginToken } from './plugin-tokens.js'
import {
  hasFullAccess,
  isAdminRole,
  isBriefingOnlyUser,
  isPrivilegedEmail,
} from './access-control.js'

export {
  hasFullAccess,
  isAdminRole,
  isBriefingOnlyUser,
  isPrivilegedEmail,
} from './access-control.js'

export type RoutePolicy =
  | 'public'
  | 'user'
  | 'machine'
  | 'webhook'
  | 'dual'
  | 'gpt_actions'
  /**
   * Per-user bearer token issued by the device-pairing flow, used by the Figma
   * plugin. Distinct from 'machine', which accepts the shared plugin secret
   * that ships inside the plugin bundle.
   */
  | 'user_token'

const FEEDBACK_REVIEWERS = (process.env.HEIMDALL_FEEDBACK_REVIEWERS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isFeedbackReviewer(email: string | undefined): boolean {
  if (!email) return false
  if (FEEDBACK_REVIEWERS.length === 0) return isPrivilegedEmail(email)
  return FEEDBACK_REVIEWERS.includes(email.toLowerCase())
}

/**
 * Require a valid per-user plugin token on a route handler.
 *
 * Middleware only checks that a bearer header is PRESENT for 'user_token'
 * routes — it runs on Edge, and resolving the token there would add a database
 * round trip to every plugin request. The real check is here, so any handler
 * under a user_token prefix MUST call this; skipping it leaves the route
 * effectively unauthenticated.
 *
 * Returns { userId, tokenId } on success, or a 401 NextResponse.
 */
export async function requirePluginUser(
  request: Request,
): Promise<{ userId: string; tokenId: string; error?: never } | { error: NextResponse; userId?: never; tokenId?: never }> {
  const resolved = await resolvePluginToken(request.headers.get('authorization'))
  if (!resolved) {
    return {
      error: NextResponse.json(
        { error: 'Valid plugin token required. Re-pair the plugin from Settings.' },
        { status: 401 },
      ),
    }
  }
  return { userId: resolved.userId, tokenId: resolved.tokenId }
}

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

const SHEETS_COOKIE_NAME = 'heimdall-sheets-token'

/**
 * Accept either a Supabase session OR a valid sheets-password cookie.
 * Use for read-only API routes that shared/password-only viewers need.
 * Returns { user, supabase } when a Supabase session is present, or
 * { user: null, supabase: null } when only the sheets cookie is valid.
 */
export async function requireUserOrSheetsCookie(request: Request) {
  const result = await requireUser(request)
  if (!result.error) return result

  const sheetsPassword = process.env.SHEETS_PASSWORD
  if (sheetsPassword) {
    const cookieHeader = request.headers.get('cookie') ?? ''
    const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${SHEETS_COOKIE_NAME}=([^;]+)`))
    if (match?.[1]) {
      try {
        const decoded = Buffer.from(decodeURIComponent(match[1]), 'base64').toString('ascii')
        if (decoded === sheetsPassword) {
          return { user: null, supabase: null }
        }
      } catch {
        // invalid token — fall through to error
      }
    }
  }

  return result
}

/**
 * Require a user with admin access: either user_metadata.role === 'admin'
 * or email domain in the privileged allow-list (legacy fallback).
 */
export async function requirePrivilegedUser(request: Request) {
  const result = await requireUser(request)
  if (result.error) return result

  if (!hasFullAccess(result.user.user_metadata, result.user.email)) {
    return {
      error: NextResponse.json(
        { error: 'Insufficient privileges' },
        { status: 403 },
      ),
    }
  }

  return result
}

/**
 * Require a user who is on the feedback-reviewer allowlist.
 * Falls back to privileged-domain check when the allowlist env is empty.
 */
export async function requireFeedbackReviewer(request: Request) {
  const result = await requireUser(request)
  if (result.error) return result

  if (!isFeedbackReviewer(result.user.email)) {
    return {
      error: NextResponse.json(
        { error: 'Feedback reviewer access required' },
        { status: 403 },
      ),
    }
  }

  return result
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

/**
 * Routes authenticated by a per-user plugin token rather than the shared
 * plugin secret. These sit UNDER /api/plugin/, so classifyApiRoute must test
 * this list before MACHINE_PREFIXES — otherwise the broader prefix wins and
 * the shared secret would be accepted after all.
 */
const USER_TOKEN_PREFIXES = [
  '/api/plugin/localization/',
]

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/briefing-assistant/auth',
  '/api/sheets/auth',
  '/api/images/proxy',
  // The pairing handshake itself cannot require a token — it is how a token is
  // obtained. Both endpoints are rate-limited and verify a hashed device code.
  '/api/plugin/pair/',
]

/** OpenAPI schema for Custom GPT Actions (no secret; operations still require GPT secret). */
const GPT_ACTIONS_OPENAPI_PATH = '/api/gpt-actions/openapi'

const GPT_ACTIONS_PREFIXES = ['/api/gpt-actions/']

/**
 * Classify an API route pathname into a policy group.
 * Single source of truth — consumed by middleware.ts and tests.
 */
export function classifyApiRoute(pathname: string): RoutePolicy {
  if (pathname === GPT_ACTIONS_OPENAPI_PATH) return 'public'
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return 'public'
  if (WEBHOOK_PREFIXES.some((p) => pathname.startsWith(p))) return 'webhook'
  // Before MACHINE_PREFIXES on purpose: these paths are nested under
  // /api/plugin/, and first-match-wins would otherwise classify them 'machine'
  // and accept the shared bundle secret.
  if (USER_TOKEN_PREFIXES.some((p) => pathname.startsWith(p))) return 'user_token'
  if (MACHINE_PREFIXES.some((p) => pathname.startsWith(p))) return 'machine'
  if (DUAL_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) return 'dual'
  if (GPT_ACTIONS_PREFIXES.some((p) => pathname.startsWith(p))) return 'gpt_actions'
  return 'user'
}
