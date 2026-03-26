import { NextRequest, NextResponse } from 'next/server'
import { buildDocumentChatOpenApiJson } from '@/lib/document-chat/openapi'

export const dynamic = 'force-dynamic'

/**
 * GET /api/gpt-actions/openapi
 * Public OpenAPI document for Custom GPT Actions import (operations still require API key).
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin
  const spec = buildDocumentChatOpenApiJson(origin)
  return NextResponse.json(spec, {
    headers: {
      'Cache-Control': 'public, max-age=300',
    },
  })
}
