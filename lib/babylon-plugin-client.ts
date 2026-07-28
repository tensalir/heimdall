/**
 * Signed client for Babylon's `/api/localization/plugin/*` routes.
 *
 * Heimdall brokers these calls so the Babylon shared secret stays server-side.
 * The plugin authenticates to Heimdall with a per-user token; Heimdall signs
 * with the shared secret and forwards. The secret is never in a bundle.
 *
 * The canonical string MUST match Babylon's `signPluginRequest` exactly:
 *
 *     `${timestamp}.${METHOD}.${pathAndQuery}.${rawBody}`
 *
 * Babylon binds method and path deliberately — every GET in that family has an
 * empty body, so a body-only signature would be replayable across all of them
 * for the full five-minute skew window. Signing a re-serialized body, or
 * dropping the query string, will fail verification.
 */

import { getEnv } from '../src/config/env.js'

export interface BabylonResponse {
  ok: boolean
  status: number
  /** Parsed JSON when the response was JSON, else null. */
  json: unknown
  /** Raw bytes, for the .xlsx download route. */
  bytes: ArrayBuffer | null
  contentType: string
}

function hexFromBuffer(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('')
}

async function signHmacSha256(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hexFromBuffer(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message)))
}

/**
 * The exact string Babylon hashes. Exported so a contract test can pin it
 * against fixed vectors that Babylon's own test asserts too — the two
 * implementations share no code, so nothing else keeps them in step.
 */
export function babylonCanonicalString(
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
): string {
  return `${timestamp}.${method.toUpperCase()}.${path}.${rawBody}`
}

export async function signBabylonRequest(
  secret: string,
  timestamp: string,
  method: string,
  path: string,
  rawBody: string,
): Promise<string> {
  return signHmacSha256(secret, babylonCanonicalString(timestamp, method, path, rawBody))
}

/**
 * Base origin for Babylon. Derived from the configured ingest URL so no extra
 * env var is needed, with an explicit override if the two ever diverge.
 */
function resolveBabylonOrigin(): string | null {
  const env = getEnv()
  const explicit = env.LOCALIZATION_BABYLON_BASE_URL
  if (explicit?.trim()) return explicit.trim().replace(/\/$/, '')
  const ingestUrl = env.LOCALIZATION_BABYLON_INGEST_URL
  if (!ingestUrl) return null
  try {
    return new URL(ingestUrl).origin
  } catch {
    return null
  }
}

/**
 * Call a Babylon plugin route with a valid signature.
 *
 * @param path  Path AND query exactly as Babylon will see it, e.g.
 *              `/api/localization/plugin/pack?projectId=abc`.
 * @param body  Already-serialized body, or undefined for GET. Pass the exact
 *              string that will be sent — this is what gets signed.
 */
export async function callBabylonPlugin(
  method: 'GET' | 'POST',
  path: string,
  body?: string,
): Promise<BabylonResponse> {
  const secret = getEnv().LOCALIZATION_BABYLON_SHARED_SECRET
  const origin = resolveBabylonOrigin()

  if (!secret || !origin) {
    return {
      ok: false,
      status: 503,
      json: {
        error:
          'Babylon bridge is not configured. Set LOCALIZATION_BABYLON_SHARED_SECRET and LOCALIZATION_BABYLON_INGEST_URL.',
      },
      bytes: null,
      contentType: 'application/json',
    }
  }

  const rawBody = body ?? ''
  const timestamp = String(Date.now())
  const signature = await signBabylonRequest(secret, timestamp, method, path, rawBody)

  const res = await fetch(`${origin}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-localization-timestamp': timestamp,
      'x-localization-signature': signature,
    },
    ...(method === 'GET' ? {} : { body: rawBody }),
  })

  const contentType = res.headers.get('content-type') ?? ''
  if (contentType.includes('application/json')) {
    return { ok: res.ok, status: res.status, json: await res.json().catch(() => null), bytes: null, contentType }
  }
  return { ok: res.ok, status: res.status, json: null, bytes: await res.arrayBuffer(), contentType }
}
