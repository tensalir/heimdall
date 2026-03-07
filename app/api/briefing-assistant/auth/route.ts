import { NextResponse } from 'next/server'

const BRIEFING_COOKIE_NAME = 'heimdall-briefing-token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30

export async function POST(request: Request) {
  const localPassword = process.env.BRIEFING_LOCAL_PASSWORD

  if (!localPassword) {
    return NextResponse.json(
      { error: 'Local password auth is not configured. Use Supabase magic link instead.' },
      { status: 503 },
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.password || body.password !== localPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = Buffer.from(localPassword).toString('base64')

  const response = NextResponse.json({ ok: true })
  response.cookies.set(BRIEFING_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: false,
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })

  return response
}
