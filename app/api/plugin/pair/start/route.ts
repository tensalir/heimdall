import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getSupabase } from '@/lib/supabase'
import {
  PAIRING_POLL_INTERVAL_MS,
  PAIRING_TTL_MS,
  generateSecret,
  generateUserCode,
  hashToken,
} from '@/lib/plugin-tokens'

/**
 * POST /api/plugin/pair/start — public.
 *
 * Begins a device-pairing handshake. Public by necessity: this is how the
 * plugin obtains a credential, so it cannot require one. Starting a pairing
 * grants nothing on its own — a signed-in human must approve the user_code
 * before any token exists.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  const { allowed, retryAfterMs } = checkRateLimit(`plugin-pair-start:${ip}`, 10, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many pairing attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }

  let body: { client_label?: string } = {}
  try {
    body = await request.json()
  } catch {
    // Body is optional.
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const deviceCode = generateSecret(32)
  const userCode = generateUserCode()
  const expiresAt = new Date(Date.now() + PAIRING_TTL_MS).toISOString()

  const { error } = await db.from('plugin_pairings').insert({
    device_code_hash: await hashToken(deviceCode),
    user_code: userCode,
    // Shown on the approval screen so the approver knows what they are
    // authorising. Untrusted client input — treat as a label, never as a fact.
    client_label: typeof body.client_label === 'string' ? body.client_label.slice(0, 120) : null,
    expires_at: expiresAt,
  })

  if (error) {
    return NextResponse.json({ error: `Could not start pairing: ${error.message}` }, { status: 500 })
  }

  const origin = new URL(request.url).origin
  return NextResponse.json({
    // Returned once, held only in plugin memory + clientStorage.
    device_code: deviceCode,
    user_code: userCode,
    verification_uri: `${origin}/ops/pair`,
    expires_at: expiresAt,
    poll_interval_ms: PAIRING_POLL_INTERVAL_MS,
  })
}
