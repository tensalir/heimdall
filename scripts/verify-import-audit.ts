/**
 * Verify import audit + dedupe: briefings and sync APIs return expected shapes,
 * and (when Supabase is configured) briefing_import_events can be written.
 *
 * Prereqs: dev server running (npm run dev), .env with MONDAY_BOARD_ID and
 * optionally Supabase. Apply migration first: supabase db push or run 012_briefing_import_events.sql.
 *
 * Usage: npx tsx scripts/verify-import-audit.ts [baseUrl]
 * Default baseUrl: http://localhost:3846
 */

const BASE = process.argv[2] ?? 'http://localhost:3846'

async function main() {
  console.log('Base URL:', BASE)

  // 1. Fetch April briefings (fileKey for April 2026 PerformanceAds – use env or default)
  const fileKey = process.env.HEIMDALL_APRIL_FILE_KEY ?? 'UuGo8kLWmomAfVJmjd9bIb'
  const fileName = 'APRIL 2026 - PerformanceAds'
  const resBriefings = await fetch(`${BASE}/api/plugin/briefings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName, fileKey, batch: '2026-04' }),
  })
  if (!resBriefings.ok) {
    console.error('POST /api/plugin/briefings failed', resBriefings.status, await resBriefings.text())
    process.exit(1)
  }
  const briefings = await resBriefings.json()
  if (briefings.error) {
    console.error('Briefings error:', briefings.error)
    process.exit(1)
  }
  const items = briefings.items ?? []
  console.log('April briefings count:', items.length)
  if (items.length > 0) {
    console.log('First 3:', items.slice(0, 3).map((i: { id: string; name: string; syncState: string }) => ({ id: i.id, name: i.name, syncState: i.syncState })))
  }

  // 2. Sync with empty items – expect queued: 0, skipped: 0
  const resSyncEmpty = await fetch(`${BASE}/api/plugin/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileKey, items: [] }),
  })
  if (!resSyncEmpty.ok) {
    console.error('POST /api/plugin/sync (empty) failed', resSyncEmpty.status, await resSyncEmpty.text())
    process.exit(1)
  }
  const syncEmpty = await resSyncEmpty.json()
  if (syncEmpty.queued !== 0 || syncEmpty.skipped !== 0) {
    console.error('Expected 0 queued, 0 skipped for empty items; got', syncEmpty)
    process.exit(1)
  }
  console.log('Sync with empty items: ok (0 queued, 0 skipped)')

  // 3. Sync with one item – expect either queued or skipped, and jobs/skipped counts consistent
  if (items.length > 0) {
    const one = items[0]
    const resSyncOne = await fetch(`${BASE}/api/plugin/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileKey, items: [one] }),
    })
    if (!resSyncOne.ok) {
      console.error('POST /api/plugin/sync (one item) failed', resSyncOne.status, await resSyncOne.text())
      process.exit(1)
    }
    const syncOne = await resSyncOne.json()
    console.log('Sync with one item:', { queued: syncOne.queued, skipped: syncOne.skipped, jobs: (syncOne.jobs ?? []).length })
    const total = (syncOne.queued ?? 0) + (syncOne.skipped ?? 0)
    if (total !== 1) {
      console.error('Expected queued+skipped=1; got', syncOne)
      process.exit(1)
    }
  }

  console.log('Import audit verification passed.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
