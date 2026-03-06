import { ZodError } from 'zod'
import { NextResponse } from 'next/server'
import {
  getFrontifyIntakeSettings,
  setFrontifyIntakeSettings,
} from '@/lib/kv'
import { frontifyIntakeSettingsSchema } from '@/src/domain/frontifyIntake/types'

export async function GET() {
  try {
    const settings = await getFrontifyIntakeSettings()
    return NextResponse.json({ settings }, { status: 200 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    const settings = frontifyIntakeSettingsSchema.parse(body?.settings ?? body)
    await setFrontifyIntakeSettings(settings)
    return NextResponse.json({ ok: true, settings }, { status: 200 })
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        { error: 'Invalid Frontify intake settings', details: error.flatten() },
        { status: 400 }
      )
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export const dynamic = 'force-dynamic'
