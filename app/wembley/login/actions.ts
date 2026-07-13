'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'

/**
 * Wembley access gate.
 *
 * Mirrors the showcase pattern: cookie value is `base64(password)`, decoded
 * + compared in middleware against `WEMBLEY_PASSWORD` with a sensible
 * default for local dev. Override `WEMBLEY_PASSWORD` in Vercel env vars
 * for production.
 */

const WEMBLEY_COOKIE_NAME = 'heimdall-wembley-token'
const WEMBLEY_DEFAULT_PASSWORD = 'loopleasing'
const THIRTY_DAYS = 60 * 60 * 24 * 30

function expectedPassword(): string {
  return process.env.WEMBLEY_PASSWORD?.trim() || WEMBLEY_DEFAULT_PASSWORD
}

function safeNextPath(value: string | null | undefined): string {
  const candidate = (value || '').trim()
  if (!candidate.startsWith('/wembley')) return '/wembley/'
  if (candidate.startsWith('/wembley/login')) return '/wembley/'
  return candidate
}

export async function authenticateWembley(formData: FormData) {
  const submitted = String(formData.get('password') ?? '').trim()
  const next = safeNextPath(String(formData.get('next') ?? '/wembley/'))

  if (!submitted || submitted !== expectedPassword()) {
    const params = new URLSearchParams({ error: '1', next })
    redirect(`/wembley/login?${params.toString()}`)
  }

  const token = Buffer.from(expectedPassword(), 'utf8').toString('base64')
  const store = await cookies()
  store.set(WEMBLEY_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: THIRTY_DAYS,
  })

  redirect(next)
}
