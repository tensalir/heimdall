import { NextResponse } from 'next/server'
import { mondayGraphql } from '@/src/integrations/monday/client'
import { frontifyProvider } from '@/src/integrations/providers/frontifyProvider'

type ServiceStatus = 'ok' | 'error' | 'unconfigured'

async function checkMonday(): Promise<ServiceStatus> {
  if (!process.env.MONDAY_API_TOKEN) return 'unconfigured'
  try {
    const data = await mondayGraphql<{ me?: { id?: string } }>('query { me { id } }')
    return data?.me?.id != null ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkFigma(): Promise<ServiceStatus> {
  const token = process.env.FIGMA_ACCESS_TOKEN
  if (!token) return 'unconfigured'
  try {
    const res = await fetch('https://api.figma.com/v1/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (!res.ok) return 'error'
    const json = await res.json().catch(() => ({}))
    return json?.handle != null || json?.id != null ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkKV(): Promise<ServiceStatus> {
  if (!process.env.KV_REST_API_URL || !process.env.KV_REST_API_TOKEN) return 'unconfigured'
  try {
    const kv = await import('@vercel/kv').then((m) => m.kv)
    const testKey = 'heimdall:health:ping'
    await kv.set(testKey, Date.now(), { ex: 10 })
    const v = await kv.get(testKey)
    return v != null ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

async function checkFrontify(): Promise<ServiceStatus> {
  if (!frontifyProvider.isConfigured()) return 'unconfigured'
  try {
    const ok = await frontifyProvider.healthCheck()
    return ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

export async function GET() {
  const [monday, figma, kv, frontify] = await Promise.all([
    checkMonday(),
    checkFigma(),
    checkKV(),
    checkFrontify(),
  ])
  return NextResponse.json(
    {
      ok: monday !== 'error' && kv !== 'error',
      service: 'heimdall',
      services: { monday, figma, kv, frontify },
    },
    { status: 200 }
  )
}

export const dynamic = 'force-dynamic'
