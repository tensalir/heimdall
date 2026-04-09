import { NextRequest, NextResponse } from 'next/server'
import { mondayGraphql, updateMultipleColumnValues } from '@/src/integrations/monday/client'
import { workingDocToBriefingDTO } from '@/src/domain/briefingAssistant/schema'
import { WorkingDocStateSchema } from '@/src/domain/briefingAssistant/schema'
import { createOrQueueFigmaPage, buildIdempotencyKey } from '@/src/orchestration/createOrQueueFigmaPage'
import { recordIntegrationCall } from '@/src/services/integrationTelemetry'
import { requireUser } from '@/lib/route-auth'

export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BRIEFING_BOARD_ID ?? process.env.MONDAY_BOARD_ID ?? ''
const DOC_COLUMN_ID = process.env.MONDAY_BRIEFING_DOC_COLUMN_ID ?? process.env.MONDAY_FEEDBACK_DOC_COLUMN_ID ?? ''

function buildBriefingDocMarkdown(sections: {
  idea?: string
  why?: string
  audience?: string
  product?: string
  formats?: string
  visual?: string
  copyInfo?: string
  test?: string
  variants?: string
  note?: string
}): string {
  const parts: string[] = []
  const entries: [string, string | undefined][] = [
    ['Idea', sections.idea],
    ['Why', sections.why],
    ['Audience', sections.audience],
    ['Product', sections.product],
    ['Formats', sections.formats],
    ['Variants', sections.variants],
    ['Note', sections.note],
    ['Visual', sections.visual],
    ['Copy info', sections.copyInfo],
    ['Testing', sections.test],
  ]
  for (const [title, value] of entries) {
    if (value?.trim()) {
      parts.push(`## ${title}\n\n${value.trim()}\n`)
    }
  }
  return parts.length ? parts.join('\n') : '(No content.)'
}

/**
 * POST /api/briefing-assistant/send-to-monday
 * Body: WorkingDocState (+ optional board_id, monday_item_id).
 * board_id: per-assignment target board; falls back to env MONDAY_BRIEFING_BOARD_ID.
 * Creates Monday item if needed, creates briefing doc, queues Figma sync.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req)
  if (auth.error) return auth.error

  const routeStart = Date.now()

  try {
    const body = await req.json() as Record<string, unknown>
    const boardIdFromBody = typeof body.board_id === 'string' ? body.board_id.trim() : ''
    const boardId = boardIdFromBody || BOARD_ID

    const mondayPeopleColumnId =
      typeof body.monday_people_column_id === 'string' ? body.monday_people_column_id.trim() : ''
    const mondayAssigneeId =
      typeof body.monday_assignee_id === 'string' ? body.monday_assignee_id.trim() : ''
    const mondayStatusColumnId =
      typeof body.monday_status_column_id === 'string' ? body.monday_status_column_id.trim() : ''
    const mondayStatusIndex =
      typeof body.monday_status_index === 'string' ? body.monday_status_index.trim() : ''
    if (!boardId) {
      return NextResponse.json(
        { error: 'board_id required in body or set MONDAY_BRIEFING_BOARD_ID' },
        { status: 500 }
      )
    }

    const parsed = WorkingDocStateSchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid working doc state', details: parsed.error.flatten() },
        { status: 400 }
      )
    }
    const state = parsed.data
    const existingItemId = (body as { monday_item_id?: string }).monday_item_id ?? state.mondayItemId

    let itemId: string

    if (existingItemId) {
      itemId = existingItemId
    } else {
      const groupId = process.env.MONDAY_BRIEFING_GROUP_ID
      let targetGroupId = groupId
      if (!targetGroupId) {
        const boardsData = await mondayGraphql<{
          boards?: Array<{ groups?: Array<{ id: string }> }>
        }>(
          `query ($boardId: ID!) {
            boards(ids: [$boardId]) {
              groups { id }
            }
          }`,
          { boardId }
        )
        targetGroupId = boardsData?.boards?.[0]?.groups?.[0]?.id ?? null
      }
      if (!targetGroupId) {
        return NextResponse.json(
          { error: 'No group on board. Set MONDAY_BRIEFING_GROUP_ID or add a group to the board.' },
          { status: 502 }
        )
      }
      const createItem = await mondayGraphql<{ create_item?: { id: string } }>(
        `mutation ($boardId: ID!, $groupId: String!, $itemName: String!) {
          create_item(board_id: $boardId, group_id: $groupId, item_name: $itemName) {
            id
          }
        }`,
        { boardId, groupId: targetGroupId, itemName: state.experimentName }
      )
      const newId = createItem?.create_item?.id
      if (!newId) {
        return NextResponse.json(
          { error: 'Monday API: failed to create item. Check board and permissions.' },
          { status: 502 }
        )
      }
      itemId = newId
    }

    const columnPatch: Record<string, unknown> = {}
    if (mondayStatusColumnId && mondayStatusIndex !== '') {
      const idx = Number(mondayStatusIndex)
      if (!Number.isNaN(idx)) {
        columnPatch[mondayStatusColumnId] = { index: idx }
      }
    }
    if (mondayPeopleColumnId && mondayAssigneeId) {
      const uid = Number(mondayAssigneeId)
      if (!Number.isNaN(uid)) {
        columnPatch[mondayPeopleColumnId] = {
          personsAndTeams: [{ id: uid, kind: 'person' }],
        }
      }
    }
    if (Object.keys(columnPatch).length > 0) {
      await updateMultipleColumnValues(boardId, itemId, columnPatch)
    }

    if (DOC_COLUMN_ID) {
      const docContent = buildBriefingDocMarkdown(state.sections)
      const createDoc = await mondayGraphql<{ create_doc?: { id: string } }>(
        `mutation ($boardId: ID!, $itemId: ID!, $columnId: String!, $title: String!, $content: String!) {
          create_doc(
            board_id: $boardId
            item_id: $itemId
            column_id: $columnId
            title: $title
            content: $content
          ) {
            id
          }
        }`,
        {
          boardId,
          itemId,
          columnId: DOC_COLUMN_ID,
          title: state.experimentName,
          content: docContent,
        }
      )
      if (!createDoc?.create_doc?.id) {
        return NextResponse.json(
          { error: 'Monday API: failed to create doc. Check doc column ID and docs:write scope.' },
          { status: 502 }
        )
      }
    }

    const briefing = workingDocToBriefingDTO({ ...state, mondayItemId: itemId }, itemId)
    const idempotencyKey = buildIdempotencyKey(itemId)
    const result = await createOrQueueFigmaPage(briefing, {
      mondayBoardId: boardId,
      idempotencyKey,
    })

    recordIntegrationCall({
      tool: 'briefing',
      provider: 'monday',
      operation: 'send_to_monday',
      durationMs: Date.now() - routeStart,
      outcome: result.outcome === 'failed' ? 'error' : 'ok',
      idempotencyKey,
      resourceId: itemId,
    })

    return NextResponse.json({
      ok: true,
      monday_item_id: itemId,
      outcome: result.outcome,
      message: result.message,
      job_id: result.job?.id,
      figma_file_key: result.figmaFileKey,
      expected_file_name: result.expectedFileName,
    })
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Send to Monday failed'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
