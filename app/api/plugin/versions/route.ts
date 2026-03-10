import { NextResponse } from 'next/server'
import { getVersionHistory, getVersionsForFile } from '@/src/services/briefingVersionStore'

export const dynamic = 'force-dynamic'

/**
 * GET /api/plugin/versions?mondayItemId=X&figmaFileKey=Y
 * or GET /api/plugin/versions?figmaFileKey=Y (all pages in file)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const mondayItemId = searchParams.get('mondayItemId')
  const figmaFileKey = searchParams.get('figmaFileKey')

  if (!figmaFileKey) {
    return NextResponse.json({ error: 'figmaFileKey is required' }, { status: 400 })
  }

  const versions = mondayItemId
    ? await getVersionHistory(mondayItemId, figmaFileKey)
    : await getVersionsForFile(figmaFileKey)

  return NextResponse.json(
    { versions },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
