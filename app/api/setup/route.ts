import { NextResponse } from 'next/server'
import { getRoutingMap, getWebhookLog } from '@/lib/kv'
import { getSupabase, hasSupabase } from '@/lib/supabase'

export async function GET() {
  try {
    const kv = !!(process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN)
    const monday = !!process.env.MONDAY_API_TOKEN
    const figma = !!process.env.FIGMA_ACCESS_TOKEN
    const [routingMap, webhookLog] = await Promise.all([getRoutingMap(), getWebhookLog(1)])
    const routingMapHasEntries = Object.keys(routingMap).length > 0
    const webhookReceived = webhookLog.length > 0

    const supabaseConfigured = hasSupabase()
    const supabaseAuthConfigured = !!(
      process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    )

    let supabaseReachable = false
    if (supabaseConfigured) {
      try {
        const db = getSupabase()
        if (db) {
          const { error } = await db.from('comment_files').select('file_key').limit(1)
          supabaseReachable = !error
        }
      } catch { /* unreachable */ }
    }

    const supabaseUrlMismatch =
      process.env.SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.SUPABASE_URL !== process.env.NEXT_PUBLIC_SUPABASE_URL

    const allPass =
      kv && monday && figma && routingMapHasEntries && webhookReceived &&
      supabaseConfigured && supabaseAuthConfigured && supabaseReachable && !supabaseUrlMismatch

    return NextResponse.json(
      {
        ready: allPass,
        checks: {
          kv,
          monday,
          figma,
          routingMap: routingMapHasEntries,
          webhookReceived,
          supabase: supabaseConfigured,
          supabaseAuth: supabaseAuthConfigured,
          supabaseReachable,
          supabaseUrlMismatch: !!supabaseUrlMismatch,
        },
      },
      { status: 200 }
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
