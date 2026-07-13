/**
 * Smoke test for pageExtractor.normalizePage and markdownEmitter.renderPageMarkdown.
 *
 * Runs without a Graph connection. Exercises:
 * - Vertical section normalization
 * - Multi-column horizontal section normalization
 * - Text web part inner HTML extraction and plain-text rendering
 * - Standard web part identification by GUID (image)
 * - Hero extraction from titleArea
 * - Unknown web part fallthrough
 *
 * Run with: `npx tsx src/extract/__smoke.ts`
 *
 * Exit code: 0 on pass, 1 on first failure with a printed diff.
 */

import { renderPageMarkdown } from './markdownEmitter.js'
import { normalizePage } from './pageExtractor.js'
import type { PageSummary } from './siteCrawler.js'

const summary: PageSummary = {
  id: 'page-1',
  title: 'How we brief',
  slug: 'how-we-brief',
  webUrl: 'https://contoso.sharepoint.com/sites/Playbook/SitePages/how-we-brief.aspx',
  lastModifiedDateTime: '2026-04-01T12:00:00Z',
}

const rawGraphResponse: Record<string, unknown> = {
  id: 'page-1',
  title: 'How we brief',
  description: 'How creative briefs flow from Monday into the studio.',
  titleArea: {
    textAboveTitle: 'Creative process',
    serverProcessedContent: {
      imageSources: { imageSource: 'https://contoso.sharepoint.com/sites/Playbook/Assets/hero.png' },
    },
  },
  canvasLayout: {
    horizontalSections: [
      {
        layout: 'oneColumn',
        columns: [
          {
            webparts: [
              {
                '@odata.type': '#microsoft.graph.textWebPart',
                innerHtml: '<h2>Step 1: define the angle</h2><p>Start from <strong>customer voice</strong>.</p>',
              },
              {
                '@odata.type': '#microsoft.graph.textWebPart',
                innerHtml: '<ul><li>Hook</li><li>Relevance</li><li>Trust</li></ul>',
              },
            ],
          },
        ],
      },
      {
        layout: 'twoColumn',
        columns: [
          {
            webparts: [
              {
                '@odata.type': '#microsoft.graph.standardWebPart',
                webPartType: 'd1d91016-032f-456d-98a4-721247c305e8',
                data: {
                  title: 'Step 2 illustration',
                  description: 'Whiteboard sketch of the brief flow',
                  properties: {
                    imageUrl: 'https://contoso.sharepoint.com/sites/Playbook/Assets/step2.png',
                    altText: 'Whiteboard sketch',
                    captionText: 'A sketch of the briefing pipeline.',
                  },
                },
              },
            ],
          },
          {
            webparts: [
              {
                '@odata.type': '#microsoft.graph.textWebPart',
                innerHtml: '<p>Pair the visual with a one-line angle hypothesis.</p>',
              },
            ],
          },
        ],
      },
      {
        layout: 'oneColumn',
        columns: [
          {
            webparts: [
              {
                '@odata.type': '#microsoft.graph.standardWebPart',
                webPartType: 'cafefeed-cafe-cafe-cafe-cafefeedcafe', // unknown GUID
                data: { title: 'Mystery part' },
              },
            ],
          },
        ],
      },
    ],
    verticalSection: {
      webparts: [
        {
          '@odata.type': '#microsoft.graph.textWebPart',
          innerHtml: '<p>Sidebar: links to brand voice resources.</p>',
        },
      ],
    },
  },
}

let failures = 0

function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ok   ${msg}`)
  } else {
    failures += 1
    console.error(`  FAIL ${msg}`)
  }
}

console.log('normalizePage smoke test')
const page = normalizePage(rawGraphResponse, summary)

assert(page.id === 'page-1', 'id is preserved from summary')
assert(page.slug === 'how-we-brief', 'slug is preserved from summary')
assert(page.title === 'How we brief', 'title is preserved from summary')
assert(
  page.description === 'How creative briefs flow from Monday into the studio.',
  'description is captured from raw',
)

assert(
  page.sections.length === 5,
  `expected 5 sections (1 hero + 3 horizontal + 1 vertical), got ${page.sections.length}`,
)

const verticalSection = page.sections[4]
assert(verticalSection?.id === 'vertical', 'last section is the vertical sidebar')
assert(verticalSection?.layout === 'vertical', 'vertical section has layout=vertical')

const heroSection = page.sections[0]
assert(heroSection?.id === 'hero', 'first section is the synthetic hero')
const heroBlock = heroSection?.blocks[0]?.block
assert(heroBlock?.kind === 'hero', 'hero block is kind=hero')
if (heroBlock?.kind === 'hero') {
  assert(
    heroBlock.imageSourceUrl === 'https://contoso.sharepoint.com/sites/Playbook/Assets/hero.png',
    'hero imageSourceUrl is extracted from titleArea',
  )
  assert(heroBlock.heading === 'How we brief', 'hero heading falls back to page title')
  assert(heroBlock.subheading === 'Creative process', 'hero subheading is textAboveTitle')
}

const firstHorizontal = page.sections[1]
assert(firstHorizontal?.layout === 'oneColumn', 'first horizontal section is oneColumn')
assert(firstHorizontal?.blocks.length === 2, 'first horizontal has 2 text blocks')
const firstTextBlock = firstHorizontal?.blocks[0]?.block
assert(firstTextBlock?.kind === 'text', 'first horizontal block is text')
if (firstTextBlock?.kind === 'text') {
  assert(firstTextBlock.html.includes('<h2>'), 'text html preserves headings')
  assert(firstTextBlock.plain.includes('Step 1: define the angle'), 'plain text strips html tags')
  assert(firstTextBlock.plain.includes('customer voice'), 'plain text preserves bold body words')
}

const twoColumnSection = page.sections[2]
assert(twoColumnSection?.layout === 'twoColumn', 'second horizontal section is twoColumn')
assert(twoColumnSection?.columnCount === 2, 'twoColumn has columnCount=2')
const imageBlock = twoColumnSection?.blocks[0]?.block
assert(imageBlock?.kind === 'image', 'first block is an image')
if (imageBlock?.kind === 'image') {
  assert(imageBlock.alt === 'Whiteboard sketch', 'image alt is altText')
  assert(imageBlock.caption === 'A sketch of the briefing pipeline.', 'image caption is captionText')
  assert(
    imageBlock.sourceUrl === 'https://contoso.sharepoint.com/sites/Playbook/Assets/step2.png',
    'image sourceUrl picks imageUrl property',
  )
  assert(imageBlock.localPath === '', 'image localPath is empty until downloader runs')
}
assert(twoColumnSection?.blocks[0]?.columnIndex === 0, 'image is in column 0')
assert(twoColumnSection?.blocks[1]?.columnIndex === 1, 'paragraph is in column 1')

const unknownSection = page.sections[3]
assert(unknownSection?.layout === 'oneColumn', 'fourth section is oneColumn (unknown GUID)')
const unknownBlock = unknownSection?.blocks[0]?.block
assert(unknownBlock?.kind === 'unknown', 'unmapped GUID becomes kind=unknown')
if (unknownBlock?.kind === 'unknown') {
  assert(
    unknownBlock.webPartType === 'cafefeed-cafe-cafe-cafe-cafefeedcafe',
    'unknown block keeps webPartType id',
  )
}

// vertical section should NOT be a separate section here — it's the 5th, not 4th. Let's check.
assert(page.sections.length >= 4, 'at minimum hero + 3 horizontal sections; vertical adds a 5th if present')

console.log('\nrenderPageMarkdown smoke test')
const md = renderPageMarkdown(page)
assert(md.startsWith('# How we brief\n'), 'markdown starts with H1 page title')
assert(md.includes('> How creative briefs flow from Monday into the studio.'), 'description renders as blockquote')
assert(md.includes('Step 1: define the angle'), 'text content survives turndown')
assert(md.includes('![Whiteboard sketch]'), 'image renders with alt')
assert(md.includes('column 1 of 2'), 'multi-column layout adds column markers')
assert(md.includes('unknown web part'), 'unknown web part is annotated')

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`)
  process.exit(1)
}
console.log(`\nAll assertions passed`)
