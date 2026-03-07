/**
 * Heimdall middleware — route-based auth + CORS + legacy redirects.
 *
 * Auth zones:
 *   /admin/*              → Supabase session (magic link / email+password)
 *   /forecast/*           → Supabase session (same as admin)
 *   /feedback/*           → Supabase session (same as admin)
 *   /briefing-assistant/* → Supabase session preferred; BRIEFING_LOCAL_PASSWORD fallback for localhost dev
 *   /sheets/*             → Cookie-based auth with SHEETS_PASSWORD
 *   /api/*                → CORS headers only (Figma plugin needs open access)
 *   /auth/*               → No auth (callback handler)
 *   /                     → No auth (landing redirect)
 *
 * Legacy redirects keep old URLs working during migration.
 */

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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
/*  CORS for API routes                                               */
/* ------------------------------------------------------------------ */

function handleApi(request: NextRequest): NextResponse {
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
  }

  const response = NextResponse.next()
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    response.headers.set(key, value)
  }
  return response
}

/* ------------------------------------------------------------------ */
/*  Admin Auth — Supabase session                                     */
/* ------------------------------------------------------------------ */

async function handleAdminAuth(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl

  // Login page is at /login (outside admin layout), not /admin/login
  // No special handling needed here

  // If Supabase is not configured, fall back to no auth (dev mode)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.next()
  }

  // Create Supabase client for middleware
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

  // Refresh session and check for user
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return response
}

/* ------------------------------------------------------------------ */
/*  Sheets cookie auth                                                */
/* ------------------------------------------------------------------ */

const SHEETS_COOKIE_NAME = 'heimdall-sheets-token'

function handleSheetsAuth(request: NextRequest): NextResponse | null {
  const sheetsPassword = process.env.SHEETS_PASSWORD
  if (!sheetsPassword) return null

  const { pathname } = request.nextUrl

  if (pathname === '/sheets/login') return null

  const token = request.cookies.get(SHEETS_COOKIE_NAME)?.value

  if (token) {
    try {
      const decoded = Buffer.from(token, 'base64').toString('ascii')
      if (decoded === sheetsPassword) return null
    } catch {
      // Invalid token, redirect to login
    }
  }

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

  // 3. API routes: CORS only
  if (pathname.startsWith('/api/')) {
    return handleApi(request)
  }

  // 4. Admin routes: Supabase session
  if (pathname.startsWith('/admin')) {
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
