import { NextResponse } from 'next/server'

const SHEETS_COOKIE_NAME = 'heimdall-sheets-token'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30 // 30 days

export async function POST(request: Request) {
  const sheetsPassword = process.env.SHEETS_PASSWORD

  if (!sheetsPassword) {
    return NextResponse.json(
      { error: 'Sheets authentication is not configured' },
      { status: 500 }
    )
  }

  let body: { password?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  if (!body.password || body.password !== sheetsPassword) {
    return NextResponse.json({ error: 'Invalid password' }, { status: 401 })
  }

  const token = Buffer.from(sheetsPassword).toString('base64')

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SHEETS_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: COOKIE_MAX_AGE,
    path: '/',
  })

  return response
}
