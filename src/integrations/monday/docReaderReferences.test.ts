/**
 * Tests for extracting URL references from the Monday doc Reference section.
 * Run with: npx tsx src/integrations/monday/docReaderReferences.test.ts
 */

import { getDocReferenceLinks } from './docReader.js'

const MONDAY_API_URL = 'https://api.monday.com/v2'
const originalFetch = globalThis.fetch

if (!process.env.MONDAY_API_TOKEN) process.env.MONDAY_API_TOKEN = 'test-token'

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

function mockGraphql(blocks: Array<{ id: string; type: string; parent_block_id?: string | null; content: unknown }>) {
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

async function runTests() {
  mockGraphql([
    { id: '1', type: 'small title', content: { text: 'Reference' } },
    { id: '2', type: 'normal text', content: { text: 'Video EXP GR06: VAR C' } },
    {
      id: '3',
      type: 'normal text',
      content: {
        deltaFormat: [
          {
            insert: 'https://www.figma.com/design/file/ref-node',
          },
        ],
      },
    },
    {
      id: '4',
      type: 'image',
      content: {
        url: 'https://loopearplugs.monday.com/protected_static/reference-image.png',
      },
    },
    { id: '5', type: 'small title', content: { text: 'Variants' } },
    {
      id: '6',
      type: 'normal text',
      content: {
        deltaFormat: [
          {
            insert: 'https://should-not-be-imported.example.com',
          },
        ],
      },
    },
  ])
  const linksA = await getDocReferenceLinks('18403277873')
  restoreFetch()
  assert(linksA.length === 1, `Reference section: expected 1 link, got ${linksA.length}`)
  assert(
    linksA[0].url === 'https://www.figma.com/design/file/ref-node',
    `Reference section: wrong url ${linksA[0]?.url}`
  )
  assert(
    linksA[0].label === 'Video EXP GR06: VAR C',
    `Reference section: wrong label ${linksA[0]?.label}`
  )
  assert(linksA[0].source === 'doc_reference', 'Reference section: wrong source')
  console.log('Reference section text URL: OK', linksA[0])

  mockGraphql([
    { id: '10', type: 'small title', content: { text: 'References' } },
    {
      id: '11',
      type: 'normal text',
      content: {
        deltaFormat: [
          {
            insert: 'Agency deck',
            attributes: { link: 'https://agency.example.com/deck' },
          },
        ],
      },
    },
    {
      id: '12',
      type: 'normal text',
      content: {
        deltaFormat: [
          {
            insert: 'Agency deck',
            attributes: { link: 'https://agency.example.com/deck' },
          },
        ],
      },
    },
  ])
  const linksB = await getDocReferenceLinks('999')
  restoreFetch()
  assert(linksB.length === 1, `Hyperlink attr: expected 1 deduped link, got ${linksB.length}`)
  assert(linksB[0].url === 'https://agency.example.com/deck', 'Hyperlink attr: wrong url')
  assert(linksB[0].label === 'Agency deck', 'Hyperlink attr: wrong label')
  console.log('Reference section hyperlink attr: OK', linksB[0])

  mockGraphql([
    { id: '20', type: 'small title', content: { text: 'Variants' } },
    {
      id: '21',
      type: 'normal text',
      content: {
        deltaFormat: [
          {
            insert: 'https://outside-section.example.com',
          },
        ],
      },
    },
  ])
  const linksC = await getDocReferenceLinks('888')
  restoreFetch()
  assert(linksC.length === 0, `Outside section: expected 0 links, got ${linksC.length}`)
  console.log('Outside reference section ignored: OK')
}

runTests()
  .then(() => {
    console.log('\nDoc reference extraction tests: all passed')
  })
  .catch((err) => {
    restoreFetch()
    console.error(err)
    process.exit(1)
  })
