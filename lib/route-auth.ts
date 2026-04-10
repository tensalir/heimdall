/**
 * Shared route-level auth helpers.
 *
 * Classifies API routes into policy groups and provides reusable
 * guards that fail closed when auth is not configured.
 */

import { NextResponse } from 'next/server.js'
import { createSupabaseRouteClient } from './supabase-auth.js'

export type RoutePolicy = 'public' | 'user' | 'machine' | 'webhook' | 'dual' | 'gpt_actions'

const PRIVILEGED_EMAIL_DOMAINS = (process.env.HEIMDALL_ALLOWED_EMAIL_DOMAINS || 'thoughtform.co,loopearplugs.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)

export function isPrivilegedEmail(email: string | undefined): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return PRIVILEGED_EMAIL_DOMAINS.includes(domain)
}

const BRIEFING_ONLY_USERS = (process.env.HEIMDALL_BRIEFING_ONLY_USERS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isBriefingOnlyUser(email: string | undefined): boolean {
  if (!email) return false
  return BRIEFING_ONLY_USERS.includes(email.toLowerCase())
}

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
 * Require a user from a privileged email domain (staff only).
 * Use for admin/ops/forecast/feedback API routes.
 */
export async function requirePrivilegedUser(request: Request) {
  const result = await requireUser(request)
  if (result.error) return result

  if (!isPrivilegedEmail(result.user.email)) {
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

const PUBLIC_PREFIXES = [
  '/api/auth/',
  '/api/health',
  '/api/briefing-assistant/auth',
  '/api/sheets/auth',
  '/api/images/proxy',
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
  if (MACHINE_PREFIXES.some((p) => pathname.startsWith(p))) return 'machine'
  if (DUAL_AUTH_PREFIXES.some((p) => pathname.startsWith(p))) return 'dual'
  if (GPT_ACTIONS_PREFIXES.some((p) => pathname.startsWith(p))) return 'gpt_actions'
  return 'user'
}
