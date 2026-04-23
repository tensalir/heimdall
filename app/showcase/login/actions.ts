'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Showcase access gate.
 *
 * Minimal password-only gate (no account) for the Creative Technology
 * showcase. Pattern mirrors the existing `heimdall-sheets-token` cookie:
 * the cookie value is `base64(password)` and middleware decodes + compares
 * it against `SHOWCASE_PASSWORD` (with a sensible default for local dev).
 *
 * The password is exposed in code only as a fallback for local/dev. In
 * production, set `SHOWCASE_PASSWORD` via Vercel env vars.
 */

const SHOWCASE_COOKIE_NAME = 'heimdall-showcase-token'
const THIRTY_DAYS = 60 * 60 * 24 * 30

function expectedPassword(): string {
  return process.env.SHOWCASE_PASSWORD?.trim() || 'getawaylimburg'
}

export async function authenticateShowcase(formData: FormData) {
  const submitted = String(formData.get('password') ?? '').trim()
  const next = String(formData.get('next') ?? '/showcase')

  if (!submitted || submitted !== expectedPassword()) {
    redirect('/showcase/login?error=1')
  }

  const token = Buffer.from(expectedPassword(), 'utf8').toString('base64')
  const store = await cookies()
  store.set(SHOWCASE_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  })

  const safeNext =
    next.startsWith('/showcase') && !next.startsWith('/showcase/login')
      ? next
      : '/showcase'
  redirect(safeNext)
}
