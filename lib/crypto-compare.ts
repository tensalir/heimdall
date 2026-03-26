/**
 * Secret comparison safe for Edge middleware (Web Crypto only; no node:crypto).
 */

async function digestSha256Utf8(s: string): Promise<Uint8Array> {
  const data = new TextEncoder().encode(s)
  const buf = await crypto.subtle.digest('SHA-256', data)
  return new Uint8Array(buf)
}

function timingSafeEqualBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!
  return diff === 0
}

/**
 * Constant-time comparison of two secrets (SHA-256 then byte compare).
 */
export async function timingSafeEqualSecret(
  expected: string,
  provided: string | null | undefined,
): Promise<boolean> {
  if (!provided || !expected) return false
  try {
    const [ha, hb] = await Promise.all([digestSha256Utf8(expected), digestSha256Utf8(provided)])
    return timingSafeEqualBytes(ha, hb)
  } catch {
    return false
  }
}
