/**
 * Heimdall middleware — route-based auth + CORS + legacy redirects.
 *
 * Role model: admins and privileged-domain users get full access, unless they
 * are explicitly marked briefing-only. Everyone else is restricted to /ops.
 *
 * Auth zones:
 *   /admin/*              → Supabase session + full access
 *   /forecast/*           → Supabase session + full access
 *   /feedback/*           → Supabase session + full access
 *   /document-chat/*      → Supabase session + full access
 *   /briefing-assistant/* → Supabase session + full access
 *   /sheets/*             → Supabase session + full access
 *   /ops/*                → Supabase session (any authenticated user)
 *   /api/*                → Classified by route policy (user / machine / webhook / public / gpt_actions)
 *   /auth/*               → No auth (callback handler)
 *   /                     → Redirects to /admin (full access) or /ops (everyone else)
 *
 * Legacy redirects keep old URLs working during migration.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { resolveCorsOrigin } from '@/lib/cors'
import { hasFullAccess } from '@/lib/access-control'
import { classifyApiRoute } from '@/lib/route-auth'
import { timingSafeEqualSecret } from '@/lib/crypto-compare'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function resolveOrigin(request: NextRequest): string {
  return resolveCorsOrigin(request.headers.get('origin'), request.nextUrl.origin, ALLOWED_ORIGINS)
}

function corsHeaders(request: NextRequest): Record<string, string> {
  const origin = resolveOrigin(request)
  return {
    ...(origin ? { 'Access-Control-Allow-Origin': origin } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers':
      'Content-Type, Authorization, X-Heimdall-Secret, X-Heimdall-Plugin-Token, X-Heimdall-Gpt-Actions-Secret',
    ...(origin ? { 'Vary': 'Origin' } : {}),
  }
}


/* ------------------------------------------------------------------ */
/*  Legacy redirects — old paths → new paths                          */
/* ------------------------------------------------------------------ */

const LEGACY_REDIRECTS: Record<string, string> = {
  '/jobs': '/admin/plugin/jobs',
  '/queue': '/admin/plugin/queue',
  '/routing': '/admin',
  '/logs': '/admin/logs',
  '/settings': '/admin/settings',
  '/comments': '/sheets',
  '/admin/jobs': '/admin/plugin/jobs',
  '/admin/queue': '/admin/plugin/queue',
  '/admin/routing': '/admin',
  '/admin/showcase': '/showcase',
}

function legacyRedirect(request: NextRequest): NextResponse | null {
  const { pathname } = request.nextUrl

  if (LEGACY_REDIRECTS[pathname]) {
    const url = request.nextUrl.clone()
    url.pathname = LEGACY_REDIRECTS[pathname]
    return NextResponse.redirect(url, 308)
  }

  if (pathname.startsWith('/comments/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/comments/', '/sheets/')
    return NextResponse.redirect(url, 308)
  }

  if (pathname.startsWith('/admin/showcase/')) {
    const url = request.nextUrl.clone()
    url.pathname = pathname.replace('/admin/showcase/', '/showcase/')
    return NextResponse.redirect(url, 308)
  }

  return null
}

/* ------------------------------------------------------------------ */
/*  API route policy classification — imported from lib/route-auth.ts  */
/* ------------------------------------------------------------------ */

function addCors(request: NextRequest, response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(corsHeaders(request))) {
    response.headers.set(key, value)
  }
  return response
}

async function handleApi(request: NextRequest): Promise<NextResponse> {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: corsHeaders(request) })
  }

  const { pathname } = request.nextUrl
  const policy = classifyApiRoute(pathname)

  if (policy === 'public') {
    return addCors(request, NextResponse.next())
  }

  if (policy === 'webhook') {
    return addCors(request, NextResponse.next())
  }

  if (policy === 'machine') {
    const machineSecret = process.env.HEIMDALL_MACHINE_SECRET
    const pluginSecret = process.env.HEIMDALL_PLUGIN_SECRET

    if (!machineSecret && !pluginSecret) {
      if (process.env.NODE_ENV === 'production') {
        return addCors(request, NextResponse.json(
          { error: 'Machine authentication not configured' },
          { status: 503, headers: corsHeaders(request) },
        ))
      }
      return addCors(request, NextResponse.next())
    }

    const providedMachine = request.headers.get('x-heimdall-secret')
    const providedPlugin = request.headers.get('x-heimdall-plugin-token')

    const machineMatch =
      !!machineSecret && (await timingSafeEqualSecret(machineSecret, providedMachine ?? ''))
    const pluginMatch =
      !!pluginSecret && (await timingSafeEqualSecret(pluginSecret, providedPlugin ?? ''))

    if (!machineMatch && !pluginMatch) {
      return addCors(request, NextResponse.json(
        { error: 'Machine authentication required' },
        { status: 403, headers: corsHeaders(request) },
      ))
    }
    return addCors(request, NextResponse.next())
  }

  if (policy === 'gpt_actions') {
    const secret = process.env.HEIMDALL_GPT_ACTIONS_SECRET?.trim()
    if (!secret) {
      if (process.env.NODE_ENV === 'production') {
        return addCors(request, NextResponse.json(
          { error: 'GPT Actions authentication not configured' },
          { status: 503, headers: corsHeaders(request) },
        ))
      }
      return addCors(request, NextResponse.next())
    }
    const authz = request.headers.get('authorization')
    const bearer = authz?.toLowerCase().startsWith('bearer ') ? authz.slice(7).trim() : ''
    const provided =
      request.headers.get('x-heimdall-gpt-actions-secret')?.trim() ||
      bearer ||
      ''
    if (!(await timingSafeEqualSecret(secret, provided))) {
      return addCors(request, NextResponse.json(
        { error: 'GPT Actions authentication required' },
        { status: 403, headers: corsHeaders(request) },
      ))
    }
    return addCors(request, NextResponse.next())
  }

  if (policy === 'user_token') {
    // Presence check only. Resolving the token means a database lookup, and
    // this middleware runs on the Edge runtime for every request — so the real
    // verification is `requirePluginUser` inside each handler, which also
    // gives the handler the user id it needs. Rejecting obviously-absent
    // credentials here just avoids waking a lambda for them.
    const authz = request.headers.get('authorization')
    if (!authz?.toLowerCase().startsWith('bearer ')) {
      return addCors(request, NextResponse.json(
        { error: 'Valid plugin token required. Re-pair the plugin from Settings.' },
        { status: 401, headers: corsHeaders(request) },
      ))
    }
    return addCors(request, NextResponse.next())
  }

  if (policy === 'dual') {
    const machineSecret = process.env.HEIMDALL_MACHINE_SECRET
    const provided = request.headers.get('x-heimdall-secret')
    if (machineSecret && (await timingSafeEqualSecret(machineSecret, provided ?? ''))) {
      return addCors(request, NextResponse.next())
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'production') {
      return addCors(request, NextResponse.json(
        { error: 'Authentication not configured' },
        { status: 503, headers: corsHeaders(request) },
      ))
    }
    return addCors(request, NextResponse.next())
  }

  let response = NextResponse.next({ request: { headers: request.headers } })
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({ request: { headers: request.headers } })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    if (isSheetsReadApi(pathname) && hasValidSheetsCookie(request)) {
      return addCors(request, NextResponse.next())
    }
    return addCors(request, NextResponse.json(
      { error: 'Authentication required' },
      { status: 401, headers: corsHeaders(request) },
    ))
  }

  return addCors(request, response)
}

/* ------------------------------------------------------------------ */
/*  Admin Auth — Supabase session                                     */
/* ------------------------------------------------------------------ */

async function handleAdminAuth(
  request: NextRequest,
  options?: { allowNonAdmin?: boolean },
): Promise<NextResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: 'Authentication not configured' }, { status: 503 })
    }
    return NextResponse.next()
  }

  let response = NextResponse.next({ request: { headers: request.headers } })

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value)
        })
        response = NextResponse.next({ request: { headers: request.headers } })
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options)
        })
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  if (!hasFullAccess(user.user_metadata, user.email) && !options?.allowNonAdmin) {
    const url = request.nextUrl.clone()
    url.pathname = '/ops'
    return NextResponse.redirect(url)
  }

  return response
}

/* ------------------------------------------------------------------ */
/*  Sheets cookie helpers (shared by page + API auth)                 */
/* ------------------------------------------------------------------ */

const SHOWCASE_COOKIE_NAME = 'heimdall-showcase-token'
const SHOWCASE_DEFAULT_PASSWORD = 'getawaylimburg'

function showcasePassword(): string {
  return process.env.SHOWCASE_PASSWORD?.trim() || SHOWCASE_DEFAULT_PASSWORD
}

function hasValidShowcaseCookie(request: NextRequest): boolean {
  const token = request.cookies.get(SHOWCASE_COOKIE_NAME)?.value
  if (!token) return false
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    return decoded === showcasePassword()
  } catch {
    return false
  }
}

async function handleShowcase(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (pathname === '/showcase/login') {
    return NextResponse.next()
  }

  if (hasValidShowcaseCookie(request)) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/showcase/login'
  url.searchParams.set('next', pathname + (request.nextUrl.search || ''))
  return NextResponse.redirect(url)
}

const WEMBLEY_COOKIE_NAME = 'heimdall-wembley-token'
const WEMBLEY_DEFAULT_PASSWORD = 'loopleasing'

function wembleyPassword(): string {
  return process.env.WEMBLEY_PASSWORD?.trim() || WEMBLEY_DEFAULT_PASSWORD
}

function hasValidWembleyCookie(request: NextRequest): boolean {
  const token = request.cookies.get(WEMBLEY_COOKIE_NAME)?.value
  if (!token) return false
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8')
    return decoded === wembleyPassword()
  } catch {
    return false
  }
}

async function handleWembley(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (pathname === '/wembley/login') {
    return NextResponse.next()
  }

  if (hasValidWembleyCookie(request)) {
    return NextResponse.next()
  }

  const url = request.nextUrl.clone()
  url.pathname = '/wembley/login'
  url.searchParams.set('next', pathname + (request.nextUrl.search || ''))
  return NextResponse.redirect(url)
}

const SHEETS_COOKIE_NAME = 'heimdall-sheets-token'

const SHEETS_READ_API_PREFIXES = [
  '/api/comments/sheet',
  '/api/comments/summarize',
  '/api/comments/thumbnail',
  '/api/figma/projects/',
  '/api/feedback',
]

function isSheetsReadApi(pathname: string): boolean {
  return SHEETS_READ_API_PREFIXES.some((p) => pathname.startsWith(p))
}

function hasValidSheetsCookie(request: NextRequest): boolean {
  const sheetsPassword = process.env.SHEETS_PASSWORD
  if (!sheetsPassword) return false
  const token = request.cookies.get(SHEETS_COOKIE_NAME)?.value
  if (!token) return false
  try {
    const decoded = Buffer.from(token, 'base64').toString('ascii')
    return decoded === sheetsPassword
  } catch {
    return false
  }
}

/* ------------------------------------------------------------------ */
/*  Main middleware                                                    */
/* ------------------------------------------------------------------ */

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // 1. Legacy redirects
  const redirect = legacyRedirect(request)
  if (redirect) return redirect

  // 2. Auth callback + login page — no auth needed
  if (pathname.startsWith('/auth/') || pathname === '/login') {
    return NextResponse.next()
  }

  // 2b. Showcase — password gate (no Supabase account required)
  if (pathname === '/showcase' || pathname.startsWith('/showcase/')) {
    return handleShowcase(request)
  }

  // 2c. Wembley OOH preview — password gate (no Supabase account required)
  if (pathname === '/wembley' || pathname.startsWith('/wembley/')) {
    return handleWembley(request)
  }

  // 3. API routes: classified by policy (user / machine / webhook / public)
  if (pathname.startsWith('/api/')) {
    return handleApi(request)
  }

  // 4. Admin + Document Chat: admin role only
  if (pathname.startsWith('/admin') || pathname.startsWith('/document-chat')) {
    return handleAdminAuth(request)
  }

  // 5. Forecast, Feedback: admin role only
  if (pathname.startsWith('/forecast') || pathname.startsWith('/feedback')) {
    return handleAdminAuth(request)
  }

  // 6. Ops: any authenticated user (non-admins land here)
  if (pathname.startsWith('/ops')) {
    return handleAdminAuth(request, { allowNonAdmin: true })
  }

  // 7. Sheets: admin role only (non-admins redirected to /ops)
  if (pathname.startsWith('/sheets')) {
    return handleAdminAuth(request)
  }

  // 8. Briefing Assistant: admin role only (non-admins redirected to /ops)
  if (pathname.startsWith('/briefing-assistant')) {
    return handleAdminAuth(request)
  }

  // 9. Everything else (root landing, etc.): require auth, non-admins go to /ops
  return handleAdminAuth(request, { allowNonAdmin: true })
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/admin/:path*',
    '/showcase',
    '/showcase/:path*',
    '/wembley',
    '/wembley/:path*',
    '/document-chat',
    '/document-chat/:path*',
    '/sheets/:path*',
    '/briefing-assistant',
    '/briefing-assistant/:path*',
    '/forecast',
    '/forecast/:path*',
    '/feedback',
    '/feedback/:path*',
    '/ops',
    '/ops/:path*',
    '/auth/:path*',
    '/api/:path*',
    '/jobs/:path*',
    '/queue/:path*',
    '/routing/:path*',
    '/logs/:path*',
    '/settings/:path*',
    '/comments/:path*',
  ],
}
