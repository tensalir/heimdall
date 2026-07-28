/**
 * Per-user bearer tokens for the Figma plugin.
 *
 * The legacy `HEIMDALL_PLUGIN_SECRET` is baked into the plugin bundle at build
 * time, so every installer holds it. That is accepted for the existing
 * org-private flows, but new routes authenticate per user instead: a token is
 * minted only after a signed-in human approves a pairing code in the browser,
 * and it can be revoked for one person without rebuilding the plugin.
 *
 * Hashing uses Web Crypto (not node:crypto) so this module stays importable
 * from Edge middleware, matching lib/crypto-compare.ts.
 */

import { getSupabase } from './supabase.js'

/** Pairing codes are useless after this; the plugin restarts the handshake. */
export const PAIRING_TTL_MS = 10 * 60 * 1000;
/** How often the plugin should poll while waiting for approval. */
export const PAIRING_POLL_INTERVAL_MS = 2500;

/** Ambiguous glyphs removed: no O/0, I/1, so a code read off a screen types cleanly. */
const USER_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomFrom(alphabet: string, length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}

/** e.g. "K7QP-3T9M" — short enough to read aloud, ~10^12 space with a 10-minute TTL. */
export function generateUserCode(): string {
  return `${randomFrom(USER_CODE_ALPHABET, 4)}-${randomFrom(USER_CODE_ALPHABET, 4)}`;
}

/** High-entropy secrets the user never sees or types. */
export function generateSecret(bytes = 32): string {
  const buf = new Uint8Array(bytes);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function hashToken(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Last 6 chars, so a user can identify a token in a list without it being reconstructable. */
export function tokenHint(value: string): string {
  return value.slice(-6);
}

export interface ResolvedPluginUser {
  userId: string;
  tokenId: string;
}

/**
 * Resolve `Authorization: Bearer <token>` to a user.
 *
 * Returns null for anything unusable — absent, unknown, revoked or expired —
 * without distinguishing between them to the caller, so a probe cannot use the
 * response to tell "this token existed once" from "this token never existed".
 */
export async function resolvePluginToken(
  authorizationHeader: string | null,
): Promise<ResolvedPluginUser | null> {
  if (!authorizationHeader) return null;
  const match = /^bearer\s+(.+)$/i.exec(authorizationHeader.trim());
  if (!match) return null;
  const token = match[1]!.trim();
  if (!token) return null;

  const db = getSupabase();
  if (!db) return null;

  const { data, error } = await db
    .from('plugin_tokens')
    .select('id, user_id, revoked_at, expires_at')
    // Looking up BY HASH means a leaked database dump does not yield usable
    // tokens, and the lookup stays a single indexed equality check.
    .eq('token_hash', await hashToken(token))
    .maybeSingle();

  if (error || !data) return null;
  if (data.revoked_at) return null;
  if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) return null;

  // Best-effort recency for the settings UI; never block the request on it.
  void db
    .from('plugin_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(undefined, () => {});

  return { userId: data.user_id as string, tokenId: data.id as string };
}
