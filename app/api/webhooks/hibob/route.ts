import { NextResponse } from 'next/server'
import {
  handleHibobTimeOffWebhook,
  verifyHibobWebhookSecret,
  type HibobWebhookV2Payload,
} from '@/src/api/webhooks/hibob'

export async function POST(request: Request) {
  try {
    const url = new URL(request.url)

    if (!(await verifyHibobWebhookSecret(url))) {
      return NextResponse.json({ error: 'Invalid webhook secret' }, { status: 403 })
    }

    const body = (await request.json()) as HibobWebhookV2Payload
    const result = await handleHibobTimeOffWebhook(body)

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}

export const dynamic = 'force-dynamic'
