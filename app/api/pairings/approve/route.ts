import { NextResponse } from 'next/server'
import { requireUser } from '@/lib/route-auth'
import { getSupabase } from '@/lib/supabase'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'

/**
 * POST /api/pairings/approve — signed-in users only.
 *
 * Binds a pairing code to the caller, after which the plugin's next poll
 * receives a token acting as that user.
 *
 * Deliberately NOT under /api/plugin/pair/, which is in PUBLIC_PREFIXES so the
 * plugin can reach it without a credential. This route is the human half of
 * the handshake and must fall through to the cookie-session policy — putting
 * it under that prefix would let anyone approve their own pairing and mint a
 * token for an account they do not control.
 */
export async function POST(request: Request) {
  const auth = await requireUser(request)
  if (auth.error) return auth.error
  if (!auth.user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  // Codes are short and typed by a human, so brute force is the threat here.
  const ip = getClientIp(request)
  const { allowed, retryAfterMs } = checkRateLimit(`pair-approve:${ip}`, 15, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }

  let body: { user_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  // Accept what a human actually types: lowercase, missing dash, stray spaces.
  const raw = typeof body.user_code === 'string' ? body.user_code : ''
  const normalized = raw.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (normalized.length !== 8) {
    return NextResponse.json({ error: 'Enter the 8-character code shown in the plugin.' }, { status: 400 })
  }
  const userCode = `${normalized.slice(0, 4)}-${normalized.slice(4)}`

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data: pairing } = await db
    .from('plugin_pairings')
    .select('id, status, expires_at, client_label')
    .eq('user_code', userCode)
    .maybeSingle()

  if (!pairing || new Date(pairing.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ error: 'That code is not valid or has expired.' }, { status: 404 })
  }
  if (pairing.status !== 'pending') {
    return NextResponse.json({ error: 'That code has already been used.' }, { status: 409 })
  }

  const { error } = await db
    .from('plugin_pairings')
    .update({
      user_id: auth.user.id,
      status: 'approved',
      approved_at: new Date().toISOString(),
    })
    .eq('id', pairing.id)
    .eq('status', 'pending')

  if (error) {
    return NextResponse.json({ error: `Could not approve: ${error.message}` }, { status: 500 })
  }

  return NextResponse.json({
    approved: true,
    client_label: pairing.client_label ?? null,
    email: auth.user.email ?? null,
  })
}
