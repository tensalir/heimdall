import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getSupabase } from '@/lib/supabase'
import { requireUser } from '@/lib/route-auth'
import { WorkingDocSectionsSchema } from '@/src/domain/briefingAssistant/schema'

export const dynamic = 'force-dynamic'

const PatchDraftBodySchema = z
  .object({
    name: z.string().min(1).max(500).optional(),
    sections: WorkingDocSectionsSchema.optional(),
    source_item_ids: z.array(z.string()).optional(),
    asset_ids: z.array(z.string()).optional(),
    monday_board_id: z.string().nullable().optional(),
    monday_status: z.string().nullable().optional(),
    monday_assignee: z.string().nullable().optional(),
    monday_item_id: z.string().nullable().optional(),
  })
  .strict()

function isUuid(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

async function loadHydratedAssets(db: NonNullable<ReturnType<typeof getSupabase>>, assetIds: string[]) {
  if (!assetIds.length) return []
  const uuids = assetIds.filter(isUuid)
  if (!uuids.length) return []

  const { data: rows } = await db
    .from('briefing_generated_assets')
    .select('id, prompt, image_url, status, model, created_at')
    .in('id', uuids)

  const byId = new Map((rows ?? []).map((r) => [r.id as string, r]))
  return assetIds
    .filter(isUuid)
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((r) => ({
      id: r!.id as string,
      prompt: r!.prompt as string,
      image_url: (r!.image_url as string | null) ?? null,
      status: r!.status as 'generating' | 'completed' | 'failed',
      model: r!.model as string,
      created_at: (r!.created_at as string) ?? new Date().toISOString(),
    }))
}

/**
 * GET /api/briefing-assistant/drafts/[draftId] — load draft + hydrated assets.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ draftId: string }> },
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const { draftId } = await ctx.params
  if (!draftId || !isUuid(draftId)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const { data: draft, error } = await db
    .from('briefing_drafts')
    .select(
      'id, name, sections, source_item_ids, asset_ids, monday_board_id, monday_status, monday_assignee, monday_item_id, created_at, updated_at',
    )
    .eq('id', draftId)
    .eq('user_id', auth.user.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!draft) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  const assets = await loadHydratedAssets(db, (draft.asset_ids as string[]) ?? [])

  return NextResponse.json({ draft, assets })
}

/**
 * PATCH /api/briefing-assistant/drafts/[draftId] — partial update (auto-save).
 */
export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ draftId: string }> },
) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const { draftId } = await ctx.params
  if (!draftId || !isUuid(draftId)) {
    return NextResponse.json({ error: 'Invalid draft id' }, { status: 400 })
  }

  const db = getSupabase()
  if (!db) {
    return NextResponse.json({ error: 'Database not configured' }, { status: 500 })
  }

  const json = await req.json().catch(() => ({}))
  const parsed = PatchDraftBodySchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid body', details: parsed.error.flatten() }, { status: 400 })
  }

  const patch = parsed.data
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
  }

  const updateRow: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  }
  if (patch.name !== undefined) {
    updateRow.name = patch.name.trim()
  }

  const { data, error } = await db
    .from('briefing_drafts')
    .update(updateRow)
    .eq('id', draftId)
    .eq('user_id', auth.user.id)
    .select(
      'id, name, sections, source_item_ids, asset_ids, monday_board_id, monday_status, monday_assignee, monday_item_id, created_at, updated_at',
    )
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) {
    return NextResponse.json({ error: 'Draft not found' }, { status: 404 })
  }

  return NextResponse.json({ draft: data })
}
