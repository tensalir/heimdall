import { NextRequest, NextResponse } from 'next/server'
import { getMondayItem } from '@/src/api/webhooks/monday'
import { columnMap, getCol } from '@/src/integrations/monday/client'
import { getDocImages, getDocIdFromColumnValue } from '@/src/integrations/monday/docReader'

export const dynamic = 'force-dynamic'

const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'
const MAX_CONCURRENCY = 4

async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIdx = 0
  async function worker() {
    while (nextIdx < items.length) {
      const idx = nextIdx++
      results[idx] = await fn(items[idx])
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()))
  return results
}

interface AssetStatus {
  itemId: string
  docImageCount: number
  docImageNames?: string[]
  error?: string
}

/**
 * POST /api/plugin/asset-status
 * Body: { items: Array<{ id: string }> }
 *
 * Read-only. For each item, resolves how many images live in its Monday brief
 * doc (via getDocImages with the item-traversal fallback). The plugin compares
 * this against how many images are already placed on the Figma page to flag
 * briefings that are missing assets. Machine-token protected by middleware.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const items = Array.isArray(body.items) ? body.items : []
    const ids = items
      .map((it: { id?: string }) => String(it?.id ?? '').trim())
      .filter((id: string) => id.length > 0)

    if (ids.length === 0) {
      return NextResponse.json({ statuses: [] })
    }

    const statuses = await mapConcurrent<string, AssetStatus>(ids, MAX_CONCURRENCY, async (itemId) => {
      try {
        const item = await getMondayItem(BOARD_ID, itemId)
        if (!item) return { itemId, docImageCount: 0, error: 'not_found' }
        const col = columnMap(item)
        const docId = getDocIdFromColumnValue(getCol(col, 'brief', 'briefing', 'doc') ?? null)
        if (!docId) return { itemId, docImageCount: 0 }
        const images = await getDocImages(docId, { itemId })
        return { itemId, docImageCount: images.length, docImageNames: images.map((i) => i.name) }
      } catch (err) {
        return { itemId, docImageCount: 0, error: err instanceof Error ? err.message : String(err) }
      }
    })

    return NextResponse.json({ statuses })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 400 }
    )
  }
}
