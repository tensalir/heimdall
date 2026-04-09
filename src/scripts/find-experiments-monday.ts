/**
 * Search Monday board for experiment names and check for Figma URLs.
 * Run: npx tsx src/scripts/find-experiments-monday.ts
 */
import 'dotenv/config'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const BOARD_ID = process.env.MONDAY_BOARD_ID ?? '18404406006'

const EXPERIMENTS = [
  'EXP-JU38.LiveLouder-Experience-Experience',
  'EXP-GAIN13-PerfectMatch-Mix-ProductFocus',
  'EXP-GAIN1-ProtectedSleep-Dream-Sleep',
  'EXP-T5PM7-Generic-Quiet-Focus&Productivity',
  'EXP-GAIN2.Timer-Switch-ProdcutFocus',
  'EXP-LM181.SwitchTokyoShoot-Switch-Mix',
  'EXP-LM180.LifestyleRender-Experience-Festivals&Nightlife',
  'EXP-LM160-CorporateGirl-Mix-Mix',
  'EXP-LM159-TravelingProfessional-Mix-Travel&Commutin',
  'EXP-SB89.SleepLuxury-Dream-Sleep',
  'EEXP-SB102.Offline-Switch-Mix',
  'EXP-JU41.321-Mix-Mix',
  'EXP-SB101.LifeSounds-Quiet-Mix',
  'EXP-JU28.USPS-Quiet-Quiet',
  'EXP-JU29.Disruption-Quiet-Quiet',
  'EXP-LM134.WhatEarplugsDo-Quiet-Mix',
  'EXP-JU26-Bundles-Bundles-Bundles',
  'EXP-JU8.AllInOne-Switch-Mix',
  'EXP-LM125-MeetLoopGrid-Switch-Mix',
  'EXP-JU18NewYearNewMe-Dream-Sleep',
  'EXP-SB63TrendsFashion-Mix-Fashion-Jewellery',
  'EXP-PN6-Quality-Mix-Gadgets&Tech',
  'EXP-SB28.CommunityDreamBlue-Dream-Sleep',
]

/** Extract experiment ID prefix (e.g. JU38, GAIN13, SB102) */
function extractExpId(name: string): string | null {
  // handles EXP-JU38, EXP-GAIN13, EEXP-SB102, EXP-T5PM7, EXP-LM181, EXP-PN6
  const m = name.match(/E?EXP[-.]?([A-Z]+\d+)/i)
  return m ? m[1].toUpperCase() : null
}

interface MondayItem {
  id: string
  name: string
  column_values: Array<{ id: string; title: string; text: string; value: string; type: string }>
}

async function mondayQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T | null> {
  const token = process.env.MONDAY_API_TOKEN
  if (!token) throw new Error('MONDAY_API_TOKEN not set')
  const res = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: token, 'API-Version': '2025-04' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Monday API ${res.status}: ${res.statusText}`)
  const json = (await res.json()) as { data?: T; errors?: Array<{ message: string }> }
  if (json.errors?.length) console.warn('Monday errors:', json.errors.map(e => e.message).join('; '))
  return json.data ?? null
}

async function getAllBoardItems(boardId: string): Promise<{ items: MondayItem[]; columns: Array<{ id: string; title: string; type?: string }> }> {
  const allItems: MondayItem[] = []
  let cursor: string | null = null

  // First page
  const firstPage = await mondayQuery<{
    boards: Array<{
      columns: Array<{ id: string; title: string; type: string }>
      items_page: {
        cursor: string | null
        items: MondayItem[]
      }
    }>
  }>(`query ($boardId: [ID!]!) {
    boards(ids: $boardId) {
      columns { id title type }
      items_page(limit: 500) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
            type
          }
        }
      }
    }
  }`, { boardId: [boardId] })

  const board = firstPage?.boards?.[0]
  if (!board) return { items: [], columns: [] }

  // Build column title map from board-level columns
  const columnMap = new Map<string, string>()
  for (const col of board.columns ?? []) {
    columnMap.set(col.id, col.title)
  }

  // Inject title into column_values based on column id
  function enrichItems(items: MondayItem[]) {
    for (const item of items) {
      for (const cv of item.column_values) {
        cv.title = columnMap.get(cv.id) ?? cv.id
      }
    }
  }

  enrichItems(board.items_page.items ?? [])
  allItems.push(...(board.items_page.items ?? []))
  cursor = board.items_page.cursor

  // Paginate
  while (cursor) {
    const nextPage = await mondayQuery<{
      next_items_page: {
        cursor: string | null
        items: MondayItem[]
      }
    }>(`query ($cursor: String!) {
      next_items_page(cursor: $cursor, limit: 500) {
        cursor
        items {
          id
          name
          column_values {
            id
            text
            value
            type
          }
        }
      }
    }`, { cursor })
    if (!nextPage?.next_items_page) break
    enrichItems(nextPage.next_items_page.items ?? [])
    allItems.push(...(nextPage.next_items_page.items ?? []))
    cursor = nextPage.next_items_page.cursor
  }

  return { items: allItems, columns: board.columns ?? [] }
}

function findFigmaUrl(item: MondayItem): string | null {
  for (const col of item.column_values) {
    const title = (col.title ?? '').toLowerCase()
    const text = (col.text ?? '').trim()
    // Check column title for figma-related names
    if (title.includes('figma') || title.includes('design') || title.includes('link') || title.includes('url')) {
      if (text.includes('figma.com')) return text
      // Check value JSON for URL
      if (col.value) {
        try {
          const parsed = JSON.parse(col.value)
          if (typeof parsed === 'string' && parsed.includes('figma.com')) return parsed
          if (parsed?.url && String(parsed.url).includes('figma.com')) return parsed.url
          if (parsed?.text && String(parsed.text).includes('figma.com')) return parsed.text
        } catch {}
      }
    }
    // Also check any column that has a figma URL in its text
    if (text.includes('figma.com')) return text
    if (col.value?.includes?.('figma.com')) {
      try {
        const parsed = JSON.parse(col.value)
        if (typeof parsed === 'string' && parsed.includes('figma.com')) return parsed
        if (parsed?.url) return parsed.url
      } catch {}
    }
  }
  return null
}

function normalize(s: string): string {
  return s.replace(/[-_.\s]/g, '').toLowerCase()
}

async function main() {
  console.log(`Searching Monday board ${BOARD_ID} for ${EXPERIMENTS.length} experiments...\n`)

  const { items, columns } = await getAllBoardItems(BOARD_ID)
  console.log(`Board has ${items.length} items total.\n`)

  // Show column structure from board
  if (columns.length > 0) {
    const cols = columns.map(c => `${c.title} (${c.type}, id=${c.id})`).join('\n  ')
    console.log(`Column structure:\n  ${cols}\n`)
  }

  // Build lookup: normalize name -> item, and expId -> item
  const byNorm = new Map<string, MondayItem>()
  const byExpId = new Map<string, MondayItem[]>()
  for (const item of items) {
    byNorm.set(normalize(item.name), item)
    const id = extractExpId(item.name)
    if (id) {
      const arr = byExpId.get(id) ?? []
      arr.push(item)
      byExpId.set(id, arr)
    }
  }

  console.log('=' .repeat(110))
  console.log('Experiment'.padEnd(52) + 'Monday?'.padEnd(10) + 'Item Name'.padEnd(30) + 'Figma URL?')
  console.log('-'.repeat(110))

  let foundCount = 0
  let figmaCount = 0

  for (const exp of EXPERIMENTS) {
    const normExp = normalize(exp)
    const expId = extractExpId(exp)

    // Try exact normalized match
    let match = byNorm.get(normExp)

    // Try expId match
    if (!match && expId) {
      const candidates = byExpId.get(expId) ?? []
      if (candidates.length === 1) match = candidates[0]
      else if (candidates.length > 1) {
        // Pick best by normalized similarity
        match = candidates.find(c => normalize(c.name).includes(normExp.slice(0, 15))) ?? candidates[0]
      }
    }

    // Try partial match: item name contains expId pattern
    if (!match && expId) {
      const lower = expId.toLowerCase()
      match = items.find(i => normalize(i.name).includes(lower))
    }

    const found = !!match
    const figmaUrl = match ? findFigmaUrl(match) : null
    if (found) foundCount++
    if (figmaUrl) figmaCount++

    const status = found ? 'YES' : 'NO'
    const itemName = match ? match.name.slice(0, 28) : '-'
    const figma = figmaUrl ? figmaUrl.slice(0, 60) + '...' : (found ? '(no figma col)' : '-')

    console.log(
      exp.slice(0, 50).padEnd(52) +
      status.padEnd(10) +
      itemName.padEnd(30) +
      figma
    )
  }

  console.log('-'.repeat(110))
  console.log(`\nSummary: ${foundCount}/${EXPERIMENTS.length} found on Monday, ${figmaCount} have Figma URLs.`)

  // Show a few sample items with Figma URLs for reference
  const withFigma = items.filter(i => findFigmaUrl(i)).slice(0, 3)
  if (withFigma.length > 0) {
    console.log('\nSample items with Figma URLs:')
    for (const i of withFigma) {
      console.log(`  ${i.name} -> ${findFigmaUrl(i)}`)
    }
  }

  // Also check if experiments exist on other boards the token has access to
  if (foundCount < EXPERIMENTS.length) {
    console.log(`\n${EXPERIMENTS.length - foundCount} experiments NOT found on board ${BOARD_ID}.`)
    console.log('These may live on a different Monday board.')
  }
}

main().catch(e => { console.error(e); process.exit(1) })
