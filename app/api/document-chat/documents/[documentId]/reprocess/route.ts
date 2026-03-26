import { NextResponse } from 'next/server'
import { requirePrivilegedUser } from '@/lib/route-auth'
import { reprocessDocumentById } from '@/lib/document-chat/ingest'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * POST /api/document-chat/documents/[documentId]/reprocess
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ documentId: string }> },
) {
  const auth = await requirePrivilegedUser(request)
  if (auth.error) return auth.error

  const { documentId } = await context.params
  try {
    const result = await reprocessDocumentById(documentId)
    return NextResponse.json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
