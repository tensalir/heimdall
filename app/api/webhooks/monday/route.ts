import { NextResponse } from 'next/server'
import { handleMondayWebhook, verifyMondayWebhookSignature } from '@/src/api/webhooks/monday'

export async function POST(request: Request) {
  try {
    const rawBody = await request.text()
    const signature = request.headers.get('x-monday-signature')

    const valid = await verifyMondayWebhookSignature(rawBody, signature)
    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 403 },
      )
    }

    const body = JSON.parse(rawBody)
    const result = await handleMondayWebhook(body)

    if (result.challenge != null) {
      return NextResponse.json({ challenge: result.challenge }, { status: 200 })
    }

    return NextResponse.json(
      {
        received: result.received,
        inserted: result.inserted,
        outcome: result.outcome,
        message: result.message,
        error: result.error,
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
