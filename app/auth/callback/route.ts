import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ADMIN_REDIRECT = '/admin'
const USER_REDIRECT = '/ops'

/**
 * GET /auth/callback
 *
 * Handles the redirect from Supabase magic link emails.
 * Exchanges the ?code= parameter for a session and sets auth cookies.
 * Admins land on /admin; everyone else lands on /ops.
 */
function sanitizeRedirect(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return ''
  try {
    const url = new URL(raw, 'http://localhost')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    return url.pathname + url.search
  } catch {
    return ''
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = sanitizeRedirect(searchParams.get('next') ?? '')

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser()
      const isAdmin = user?.user_metadata?.role === 'admin'
      const defaultDest = isAdmin ? ADMIN_REDIRECT : USER_REDIRECT
      const next = rawNext || defaultDest
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
