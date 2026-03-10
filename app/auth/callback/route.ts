import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * GET /auth/callback
 *
 * Handles the redirect from Supabase magic link emails.
 * Exchanges the ?code= parameter for a session and sets auth cookies.
 */
function sanitizeRedirect(raw: string): string {
  if (!raw.startsWith('/') || raw.startsWith('//')) return '/admin'
  try {
    const url = new URL(raw, 'http://localhost')
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '/admin'
    return url.pathname + url.search
  } catch {
    return '/admin'
  }
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = sanitizeRedirect(searchParams.get('next') ?? '/admin')

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
      return NextResponse.redirect(new URL(next, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_failed', request.url))
}
