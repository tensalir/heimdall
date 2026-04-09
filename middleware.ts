/**
 * Heimdall middleware — route-based auth + CORS + legacy redirects.
 *
 * Auth zones:
 *   /admin/*              → Supabase session (magic link / email+password)
 *   /forecast/*           → Supabase session (same as admin)
 *   /feedback/*           → Supabase session (same as admin)
 *   /briefing-assistant/* → Supabase session preferred; BRIEFING_LOCAL_PASSWORD fallback for localhost dev
 *   /sheets/*             → Cookie-based auth with SHEETS_PASSWORD
 *   /document-chat/*      → Supabase session + privileged domain (same as admin)
 *   /api/*                → Classified by route policy (user / machine / webhook / public / gpt_actions)
 *   /auth/*               → No auth (callback handler)
 *   /                     → No auth (landing redirect)
 *
 * API routes default to requiring a Supabase session unless explicitly
 * classified as public, machine, or webhook in the policy map.
 *
 * Legacy redirects keep old URLs working during migration.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { classifyApiRoute } from '@/lib/route-auth'
import { timingSafeEqualSecret } from '@/lib/crypto-compare'

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)

function resolveOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin') ?? ''
  if (ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)) return origin
  if (/^https:\/\/.*\.vercel\.app$/.test(origin)) return origin
  if (origin && origin === request.nextUrl.origin) return origin
  return ''
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

const PRIVILEGED_EMAIL_DOMAINS = (process.env.HEIMDALL_ALLOWED_EMAIL_DOMAINS || 'thoughtform.co,loopearplugs.com')
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)

function isPrivilegedUser(email: string | undefined): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return PRIVILEGED_EMAIL_DOMAINS.includes(domain)
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

async function handleAdminAuth(request: NextRequest): Promise<NextResponse> {
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

  if (!isPrivilegedUser(user.email)) {
    return NextResponse.json({ error: 'Insufficient privileges' }, { status: 403 })
  }

  return response
}

/* ------------------------------------------------------------------ */
/*  Sheets cookie helpers (shared by page + API auth)                 */
/* ------------------------------------------------------------------ */

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
/*  Sheets page auth                                                  */
/* ------------------------------------------------------------------ */

function handleSheetsAuth(request: NextRequest): NextResponse | null {
  const sheetsPassword = process.env.SHEETS_PASSWORD
  if (!sheetsPassword) return null

  const { pathname } = request.nextUrl
  if (pathname === '/sheets/login') return null

  if (hasValidSheetsCookie(request)) return null

  const url = request.nextUrl.clone()
  url.pathname = '/sheets/login'
  url.searchParams.set('redirect', pathname)
  return NextResponse.redirect(url)
}

/* ------------------------------------------------------------------ */
/*  Briefing Assistant auth — Supabase preferred, local password fbk  */
/* ------------------------------------------------------------------ */

const BRIEFING_COOKIE_NAME = 'heimdall-briefing-token'

async function handleBriefingAuth(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  if (pathname === '/briefing-assistant/login') return NextResponse.next()

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && supabaseAnonKey) {
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
    if (user) return response
  }

  const localPassword = process.env.BRIEFING_LOCAL_PASSWORD
  if (localPassword) {
    const token = request.cookies.get(BRIEFING_COOKIE_NAME)?.value
    if (token) {
      try {
        const decoded = Buffer.from(token, 'base64').toString('ascii')
        if (decoded === localPassword) return NextResponse.next()
      } catch { /* invalid token */ }
    }
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!localPassword) return NextResponse.next()
    const url = request.nextUrl.clone()
    url.pathname = '/briefing-assistant/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  const url = request.nextUrl.clone()
  url.pathname = '/login'
  url.searchParams.set('next', pathname)
  return NextResponse.redirect(url)
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

  // 3. API routes: classified by policy (user / machine / webhook / public)
  if (pathname.startsWith('/api/')) {
    return handleApi(request)
  }

  // 4. Admin + Document Chat: Supabase session + privileged domain
  if (pathname.startsWith('/admin') || pathname.startsWith('/document-chat')) {
    return handleAdminAuth(request)
  }

  // 5. Forecast, Feedback, Ops: internal tools — Supabase session (same as admin)
  if (pathname.startsWith('/forecast') || pathname.startsWith('/feedback') || pathname.startsWith('/ops')) {
    return handleAdminAuth(request)
  }

  // 6. Sheets routes: cookie-based auth
  if (pathname.startsWith('/sheets')) {
    const denied = handleSheetsAuth(request)
    if (denied) return denied
    return NextResponse.next()
  }

  // 7. Briefing Assistant: Supabase session preferred, local password fallback
  if (pathname.startsWith('/briefing-assistant')) {
    return handleBriefingAuth(request)
  }

  // 8. Everything else (root landing, etc.)
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/',
    '/login',
    '/admin/:path*',
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
