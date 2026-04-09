/**
 * Verify routing and idempotency without hitting live Monday/Figma.
 * Run: npx tsx src/scripts/verify-routing.ts
 */

import { parseBatchToCanonical } from '../domain/routing/batchToFile.js'
import { resolveFigmaTarget } from '../orchestration/resolveFigmaTarget.js'
import { createOrQueueFigmaPage, buildIdempotencyKey } from '../orchestration/createOrQueueFigmaPage.js'
import type { BriefingDTO } from '../domain/briefing/schema.js'

const batches = ['MARCH 2026', 'Mar 2026', '2026-03', 'April 2027', 'invalid', '']
console.log('--- parseBatchToCanonical ---')
for (const b of batches) {
  const r = parseBatchToCanonical(b)
  console.log(JSON.stringify({ batch: b, result: r?.canonicalKey ?? null, name: r?.expectedFileName ?? null }))
}

console.log('\n--- resolveFigmaTarget ---')
for (const b of ['MARCH 2026', '2026-04']) {
  const t = resolveFigmaTarget(b)
  console.log(JSON.stringify({ batch: b, canonical: t?.batchCanonical, expectedFileName: t?.expectedFileName, fileKey: t?.figmaFileKey ?? null }))
}

console.log('\n--- createOrQueueFigmaPage + idempotency ---')
const briefing: BriefingDTO = {
  mondayItemId: '123',
  experimentName: 'EXP-LM177.ChooseYourLoop-Mix-Productfocus',
  batchCanonical: '2026-03',
  batchRaw: 'MARCH 2026',
  variants: [{ id: 'A' }, { id: 'B' }, { id: 'C' }, { id: 'D' }],
}
const key1 = buildIdempotencyKey('123', 'ts1')
const r1 = await createOrQueueFigmaPage(briefing, { mondayBoardId: '18404406006', idempotencyKey: key1 })
console.log('First call:', r1.outcome, r1.message)
const r2 = await createOrQueueFigmaPage(briefing, { mondayBoardId: '18404406006', idempotencyKey: key1 })
console.log('Second call (same key):', r2.outcome, r2.job?.state ?? '-', '(expected: skipped or queued with existing job)')
console.log('\nDone.')
