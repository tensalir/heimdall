import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rate-limit'
import { getSupabase } from '@/lib/supabase'
import { generateSecret, hashToken, tokenHint } from '@/lib/plugin-tokens'

/**
 * POST /api/plugin/pair/poll — public.
 *
 * The plugin polls with its device_code until a human approves. On approval
 * this mints the per-user token and returns it ONCE; the pairing row is marked
 * issued so the same code cannot mint a second token.
 *
 * Knowing a device_code is the whole credential here, which is why it is 32
 * random bytes, hashed at rest, and expires in ten minutes.
 */
export async function POST(request: Request) {
  const ip = getClientIp(request)
  // Generous: a plugin legitimately polls every couple of seconds while a user
  // walks over to their browser. Still bounded to stop code-guessing.
  const { allowed, retryAfterMs } = checkRateLimit(`plugin-pair-poll:${ip}`, 300, 15 * 60 * 1000)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many polling attempts. Try again later.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) } },
    )
  }

  let body: { device_code?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const deviceCode = typeof body.device_code === 'string' ? body.device_code.trim() : ''
  if (!deviceCode) {
    return NextResponse.json({ error: 'device_code is required' }, { status: 400 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 503 })
  }

  const { data: pairing } = await db
    .from('plugin_pairings')
    .select('id, user_id, status, expires_at')
    .eq('device_code_hash', await hashToken(deviceCode))
    .maybeSingle()

  // Unknown and expired are reported identically: a caller should not be able
  // to probe which device codes ever existed.
  if (!pairing || new Date(pairing.expires_at as string).getTime() <= Date.now()) {
    return NextResponse.json({ status: 'expired' }, { status: 410 })
  }
  if (pairing.status === 'issued') {
    return NextResponse.json({ status: 'expired' }, { status: 410 })
  }
  if (pairing.status !== 'approved' || !pairing.user_id) {
    return NextResponse.json({ status: 'pending' }, { status: 202 })
  }

  // Claim the pairing BEFORE minting. The `.eq('status', 'approved')` makes
  // this a compare-and-swap: of two concurrent polls only one update matches a
  // row, so only one can go on to mint. Minting first would let both pass the
  // check above and leave a stray token belonging to nobody.
  const { data: claimed } = await db
    .from('plugin_pairings')
    .update({ status: 'issued', issued_at: new Date().toISOString() })
    .eq('id', pairing.id)
    .eq('status', 'approved')
    .select('id, user_id')
    .maybeSingle()

  if (!claimed) {
    return NextResponse.json({ status: 'expired' }, { status: 410 })
  }

  const token = generateSecret(32)
  const { error: tokenError } = await db.from('plugin_tokens').insert({
    user_id: claimed.user_id,
    token_hash: await hashToken(token),
    token_hint: tokenHint(token),
    label: 'Figma plugin',
  })
  if (tokenError) {
    // The pairing is spent; the user re-pairs. Preferable to the alternative,
    // where a retry could mint a second live token.
    return NextResponse.json(
      { error: `Could not issue token: ${tokenError.message}. Start pairing again.` },
      { status: 500 },
    )
  }

  return NextResponse.json({ status: 'approved', token })
}
