import { NextResponse } from 'next/server'
import { syncLeaveStatusFromHibob } from '@/src/services/hibobLeaveSync'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * GET /api/cron/hibob-sync
 *
 * Daily cron (06:00 UTC) that reconciles the Monday board with HiBob's
 * "who's out today" data. Handles date-boundary transitions that the
 * real-time webhook cannot catch:
 *   - Leave that starts today (approved days/weeks ago)
 *   - Leave that ended yesterday (employee is back)
 *
 * Protected by Vercel CRON_SECRET or HEIMDALL_MACHINE_SECRET.
 */
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  const machineSecret = process.env.HEIMDALL_MACHINE_SECRET

  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null
  const headerSecret = request.headers.get('x-heimdall-secret')

  const authorized =
    (cronSecret && bearerToken === cronSecret) ||
    (machineSecret && headerSecret === machineSecret)

  if (!authorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await syncLeaveStatusFromHibob()
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
