/**
 * Tests for Monday doc image extraction (getDocImages).
 * Run with: npx tsx src/integrations/monday/docReaderImages.test.ts
 *
 * Mocks the Monday GraphQL client to assert image block parsing for:
 * - Case A: image blocks with assetId (and optional url)
 * - Case B: image blocks with publicUrl only
 * - Nested content shapes (content.data, content.image, etc.)
 * - The 2026-07 Monday regression: docs invisible to docs(object_ids) must be
 *   recovered via the owning item's doc column (item-traversal fallback).
 */

import { getDocImages } from './docReader.js'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const originalFetch = globalThis.fetch

// So mondayGraphql runs (it skips if token missing)
if (!process.env.MONDAY_API_TOKEN) process.env.MONDAY_API_TOKEN = 'test-token'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

// Mock fetch to return controlled doc blocks
function mockGraphql(blocks: Array<{ id: string; type: string; content: unknown }>) {
  ;(globalThis as any).fetch = async (url: string, init: RequestInit) => {
    if (url !== MONDAY_API_URL || init?.method !== 'POST') {
      return originalFetch(url, init as RequestInit)
    }
    const body = JSON.parse((init.body as string) || '{}')
    const variables = body.variables || {}
    const page = variables.page ?? 1
    const limit = variables.limit ?? 100
    const start = (page - 1) * limit
    const chunk = blocks.slice(start, start + limit)
    return new Response(
      JSON.stringify({
        data: {
          docs: [
            {
              id: 'doc-1',
              blocks: chunk,
            },
          ],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
}

function restoreFetch() {
  globalThis.fetch = originalFetch
}

interface RoutedDoc {
  id?: string
  object_id?: string | number
  blocks: Array<{ id: string; type: string; content: unknown }>
}

/**
 * Routed mock: docs(object_ids) queries and item-traversal (DocValue) queries
 * get separate payloads. Simulates the 2026-07 Monday regression where
 * new-engine docs are invisible to docs(object_ids) but still reachable via
 * items → column_values → DocValue.file.doc. Entries in itemDocs that are
 * null mimic non-doc columns / empty doc columns (no `file` field).
 * Returns per-route call counters for assertions.
 */
function mockGraphqlRouted(config: { objectIdsDocs: RoutedDoc[]; itemDocs: Array<RoutedDoc | null> }) {
  const calls = { objectIds: 0, item: 0 }
  ;(globalThis as any).fetch = async (url: string, init: RequestInit) => {
    if (url !== MONDAY_API_URL || init?.method !== 'POST') {
      return originalFetch(url, init as RequestInit)
    }
    const body = JSON.parse((init.body as string) || '{}')
    const query = String(body.query || '')
    const variables = body.variables || {}
    const page = variables.page ?? 1
    const limit = variables.limit ?? 100
    const start = (page - 1) * limit

    if (query.includes('DocValue')) {
      calls.item++
      return new Response(
        JSON.stringify({
          data: {
            items: [
              {
                column_values: config.itemDocs.map((doc) =>
                  doc ? { file: { doc: { ...doc, blocks: doc.blocks.slice(start, start + limit) } } } : {}
                ),
              },
            ],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    }

    calls.objectIds++
    return new Response(
      JSON.stringify({
        data: {
          docs: config.objectIdsDocs.map((doc) => ({
            id: doc.id ?? 'doc-1',
            blocks: doc.blocks.slice(start, start + limit),
          })),
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )
  }
  return calls
}

function captureWarns(): { warns: string[]; restore: () => void } {
  const warns: string[] = []
  const original = console.warn
  ;(console as { warn: (...a: unknown[]) => void }).warn = (...a: unknown[]) => {
    warns.push(String(a[0] ?? ''))
  }
  return { warns, restore: () => { console.warn = original } }
}

async function runTests() {
  // Case A: image block with assetId and url (Monday asset)
  mockGraphql([
    {
      id: 'block-1',
      type: 'image',
      content: {
        url: 'https://monday.com/resources/12345/image.png',
        assetId: 12345,
        width: 900,
        alignment: 'center',
      },
    },
  ])
  const imagesA = await getDocImages('18400460675')
  restoreFetch()
  assert(imagesA.length === 1, `Case A: expected 1 image, got ${imagesA.length}`)
  assert(imagesA[0].assetId === '12345', `Case A: expected assetId 12345, got ${imagesA[0].assetId}`)
  assert(!!imagesA[0].url, 'Case A: expected url')
  assert(imagesA[0].source === 'doc', 'Case A: source doc')
  console.log('Case A (assetId + url): OK', imagesA[0])

  // Case B: image block with publicUrl only (public URL image)
  mockGraphql([
    {
      id: 'block-2',
      type: 'image',
      content: {
        width: 123,
        publicUrl: 'https://www.test.com/static/download/testimage.png',
        direction: 'rtl',
        alignment: 'right',
      },
    },
  ])
  const imagesB = await getDocImages('999')
  restoreFetch()
  assert(imagesB.length === 1, `Case B: expected 1 image, got ${imagesB.length}`)
  assert(
    imagesB[0].url === 'https://www.test.com/static/download/testimage.png',
    `Case B: wrong url ${imagesB[0].url}`
  )
  console.log('Case B (publicUrl only): OK', imagesB[0])

  // Nested content: content.image.src
  mockGraphql([
    {
      id: 'block-3',
      type: 'image',
      content: {
        data: {
          image: {
            src: 'https://nested.example.com/photo.jpg',
            assetId: 67890,
          },
        },
      },
    },
  ])
  const imagesC = await getDocImages('888')
  restoreFetch()
  assert(imagesC.length === 1, `Nested: expected 1 image, got ${imagesC.length}`)
  assert(
    imagesC[0].url === 'https://nested.example.com/photo.jpg',
    `Nested: wrong url ${imagesC[0].url}`
  )
  assert(imagesC[0].assetId === '67890', `Nested: expected assetId, got ${imagesC[0].assetId}`)
  console.log('Nested content (data.image): OK', imagesC[0])

  // rawUrl variant
  mockGraphql([
    {
      id: 'block-4',
      type: 'file',
      content: { rawUrl: 'https://files.example.com/doc.pdf', name: 'doc.pdf' },
    },
  ])
  const imagesD = await getDocImages('777')
  restoreFetch()
  assert(imagesD.length === 1, `rawUrl: expected 1 entry, got ${imagesD.length}`)
  assert(imagesD[0].url === 'https://files.example.com/doc.pdf', 'rawUrl: wrong url')
  console.log('rawUrl + file type: OK', imagesD[0])

  // Case: Current real-world Monday shape captured 2026-07-01 for the Loop
  // Paid Social board. Locks in the shape our production pipeline sees today
  // so a future silent Monday-shape drift is caught immediately.
  mockGraphql([
    {
      id: 'block-real-1',
      type: 'image',
      content: {
        url: 'https://loopearplugs.monday.com/protected_static/2641482/resources/2989548909/screenshot.png',
        width: null,
        assetId: 2989548909,
        alignment: 'left',
        direction: 'ltr',
        aspectRatio: null,
        widthPercentage: 100,
      },
    },
  ])
  const imagesReal = await getDocImages('18414414717')
  restoreFetch()
  assert(imagesReal.length === 1, `Real shape: expected 1 image, got ${imagesReal.length}`)
  assert(imagesReal[0].assetId === '2989548909', `Real shape: assetId not extracted, got ${imagesReal[0].assetId}`)
  assert(imagesReal[0].url.startsWith('https://loopearplugs.monday.com/'), 'Real shape: url missing')
  console.log('Case Real (current Monday shape): OK', imagesReal[0])

  // Case: Broadened block-type tolerance for Monday shape drift.
  // These variants are not the current Monday type but have been observed in
  // adjacent doc shapes; the broadened filter accepts them so we don't
  // silently drop images when Monday tweaks the type string.
  mockGraphql([
    { id: 'variant-1', type: 'image_file', content: { url: 'https://x/a.png', assetId: 1 } },
    { id: 'variant-2', type: 'page_image', content: { url: 'https://x/b.png', assetId: 2 } },
    { id: 'variant-3', type: 'photo', content: { url: 'https://x/c.png', assetId: 3 } },
    { id: 'variant-4', type: 'embedded_image', content: { url: 'https://x/d.png', assetId: 4 } },
  ])
  const imagesVariants = await getDocImages('555')
  restoreFetch()
  assert(imagesVariants.length === 4, `Variant types: expected 4 images, got ${imagesVariants.length}`)
  const variantIds = imagesVariants.map((i) => i.assetId).sort()
  assert(
    JSON.stringify(variantIds) === JSON.stringify(['1', '2', '3', '4']),
    `Variant types: wrong assetIds ${JSON.stringify(variantIds)}`
  )
  console.log('Case Variant types (image_file / page_image / photo / embedded_image): OK')

  // Case: Video/audio blocks must still be rejected — figma.createImage would
  // fail on those bytes, so extracting them would move the failure downstream
  // where the user only sees a silent "0 placed" outcome.
  mockGraphql([
    {
      id: 'video-1',
      type: 'video',
      content: {
        url: 'https://loopearplugs.monday.com/protected_static/x/y.mp4',
        assetId: 999,
      },
    },
    {
      id: 'audio-1',
      type: 'audio_clip',
      content: {
        url: 'https://loopearplugs.monday.com/protected_static/x/z.mp3',
        assetId: 998,
      },
    },
  ])
  const imagesMedia = await getDocImages('444')
  restoreFetch()
  assert(imagesMedia.length === 0, `Video/audio: expected 0 images, got ${imagesMedia.length}`)
  console.log('Case Video/audio rejection: OK')

  // Case: The observability warn path — image-typed blocks present but no
  // extractable URL/assetId. Must return [] without throwing.
  const originalWarn = console.warn
  let warnCalled = false
  ;(console as { warn: (...a: unknown[]) => void }).warn = (..._args: unknown[]) => {
    warnCalled = true
  }
  mockGraphql([
    { id: 'shape-drift-1', type: 'image', content: { width: 800, alignment: 'center' } },
  ])
  const imagesDrift = await getDocImages('333')
  restoreFetch()
  console.warn = originalWarn
  assert(imagesDrift.length === 0, `Shape drift: expected 0 images, got ${imagesDrift.length}`)
  assert(warnCalled, 'Shape drift: expected console.warn to be called for diagnostic visibility')
  console.log('Case Shape drift observability: OK (warned as expected)')

  // Empty doc
  mockGraphql([])
  const imagesE = await getDocImages('666')
  restoreFetch()
  assert(imagesE.length === 0, `Empty: expected 0 images, got ${imagesE.length}`)
  console.log('Empty doc: OK')

  // Invalid doc id
  const imagesF = await getDocImages('')
  assert(imagesF.length === 0, 'Empty docId: expected 0')
  const imagesG = await getDocImages('abc')
  assert(imagesG.length === 0, 'Non-numeric docId: expected 0')
  console.log('Invalid doc id: OK')

  // === 2026-07 Monday regression: new-engine docs are invisible to
  // docs(object_ids) (empty result, no error) but reachable via the owning
  // item's doc column. Shape captured 2026-07-06 from EXP-LM331/EXP-LM329
  // (board "Paid Social - Studio"). ===

  // Case: fallback recovers the doc through the item, across multiple doc
  // columns, including the width-as-string variant seen in real blocks.
  {
    const cap = captureWarns()
    const calls = mockGraphqlRouted({
      objectIdsDocs: [],
      itemDocs: [
        null, // non-doc column
        { id: '99999999', object_id: '111', blocks: [] }, // other doc column, different doc
        {
          id: '44091687',
          object_id: '18420658771',
          blocks: [
            {
              id: '151591ba-c0b2-4a4d-8418-544faba08b18',
              type: 'image',
              content: {
                url: 'https://loopearplugs.monday.com/protected_static/2641482/resources/3089551681/image-from-clipboard.png',
                width: 695,
                assetId: 3089551681,
                alignment: 'left',
                aspectRatio: '1388x1314',
                widthPercentage: '0.77',
              },
            },
            {
              id: 'a13d596a-4385-49f3-9352-4e474ae08155',
              type: 'image',
              content: {
                url: 'https://loopearplugs.monday.com/protected_static/2641482/resources/3082194219/image-from-clipboard.png',
                width: '1830',
                assetId: 3082194219,
                alignment: 'left',
                aspectRatio: '1830x534',
                widthPercentage: '2.0',
              },
            },
          ],
        },
      ],
    })
    const imagesFallback = await getDocImages('18420658771', { itemId: '12379406461' })
    restoreFetch()
    cap.restore()
    assert(imagesFallback.length === 2, `Fallback: expected 2 images, got ${imagesFallback.length}`)
    assert(imagesFallback[0].assetId === '3089551681', `Fallback: wrong assetId ${imagesFallback[0].assetId}`)
    assert(imagesFallback[1].assetId === '3082194219', `Fallback: wrong assetId ${imagesFallback[1].assetId}`)
    assert(calls.objectIds >= 1 && calls.item >= 1, 'Fallback: expected both query routes to be hit')
    assert(
      cap.warns.some((w) => w.includes('recovered via item-traversal fallback')),
      'Fallback: expected recovery warn'
    )
    console.log('Case 2026-07 fallback (docs invisible → item traversal): OK')
  }

  // Case: fallback pagination — a matching doc with more than one page of
  // blocks must be fetched fully through the nested blocks(limit, page) args.
  {
    const cap = captureWarns()
    const pageOne: Array<{ id: string; type: string; content: unknown }> = []
    for (let i = 0; i < 99; i++) {
      pageOne.push({ id: `filler-${i}`, type: 'normal text', content: { deltaFormat: [{ insert: `t${i}` }] } })
    }
    pageOne.push({ id: 'img-p1', type: 'image', content: { url: 'https://x/p1.png', assetId: 1 } })
    const pageTwo = [
      { id: 'img-p2a', type: 'image', content: { url: 'https://x/p2a.png', assetId: 2 } },
      { id: 'img-p2b', type: 'image', content: { url: 'https://x/p2b.png', assetId: 3 } },
    ]
    const calls = mockGraphqlRouted({
      objectIdsDocs: [],
      itemDocs: [{ id: '1', object_id: '555', blocks: [...pageOne, ...pageTwo] }],
    })
    const imagesPaged = await getDocImages('555', { itemId: '42' })
    restoreFetch()
    cap.restore()
    assert(imagesPaged.length === 3, `Fallback pagination: expected 3 images, got ${imagesPaged.length}`)
    assert(calls.item >= 2, `Fallback pagination: expected >=2 item queries, got ${calls.item}`)
    console.log('Case Fallback pagination: OK')
  }

  // Case: doc invisible on BOTH paths — must return [] and warn loudly
  // (this exact silence is how the blackout went unnoticed).
  {
    const cap = captureWarns()
    mockGraphqlRouted({
      objectIdsDocs: [],
      itemDocs: [{ id: '1', object_id: '222', blocks: [] }], // no doc matches
    })
    const imagesGone = await getDocImages('18420658771', { itemId: '12379406461' })
    restoreFetch()
    cap.restore()
    assert(imagesGone.length === 0, `Both-paths-empty: expected 0 images, got ${imagesGone.length}`)
    assert(
      cap.warns.some((w) => w.includes('doc invisible to docs(object_ids)')),
      'Both-paths-empty: expected invisibility warn'
    )
    console.log('Case Both paths empty (warns): OK')
  }

  // Case: no itemId → fallback must NOT be attempted, but the invisibility
  // warn still fires so callers that have not threaded itemId stay visible.
  {
    const cap = captureWarns()
    const calls = mockGraphqlRouted({ objectIdsDocs: [], itemDocs: [] })
    const imagesNoItem = await getDocImages('18420658771')
    restoreFetch()
    cap.restore()
    assert(imagesNoItem.length === 0, `No-itemId: expected 0 images, got ${imagesNoItem.length}`)
    assert(calls.item === 0, `No-itemId: fallback route must not be queried, got ${calls.item}`)
    assert(
      cap.warns.some((w) => w.includes('doc invisible to docs(object_ids)')),
      'No-itemId: expected invisibility warn'
    )
    console.log('Case No itemId (no fallback, still warns): OK')
  }
}

runTests()
  .then(() => {
    console.log('\nDoc image extraction tests: all passed')
  })
  .catch((err) => {
    restoreFetch()
    console.error(err)
    process.exit(1)
  })
