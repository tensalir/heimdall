import type { Client } from '@microsoft/microsoft-graph-client'

import type { PageSummary } from './siteCrawler.js'
import type {
  Block,
  BlockWithPosition,
  EmbedBlock,
  HeroBlock,
  ImageBlock,
  LinkBlock,
  PageContent,
  Section,
  SectionLayout,
  TextBlock,
  UnknownBlock,
} from './types.js'

/**
 * Fetch a single SharePoint page expanded with its canvasLayout, then normalize it
 * into our internal PageContent shape.
 *
 * Graph endpoint:
 *   GET /sites/{siteId}/pages/{pageId}/microsoft.graph.sitePage?$expand=canvasLayout
 */
export async function extractPage(
  client: Client,
  siteId: string,
  summary: PageSummary,
): Promise<PageContent> {
  const path = `/sites/${siteId}/pages/${summary.id}/microsoft.graph.sitePage?$expand=canvasLayout`
  const raw = (await client.api(path).get()) as Record<string, unknown>
  return normalizePage(raw, summary)
}

/**
 * Pure function that turns a raw Graph sitePage response (with $expand=canvasLayout) into
 * a normalized PageContent. Exposed separately so we can unit-test it without a live Graph.
 */
export function normalizePage(raw: Record<string, unknown>, summary: PageSummary): PageContent {
  const description = typeof raw.description === 'string' ? raw.description : undefined
  const titleArea = (raw.titleArea ?? undefined) as
    | { textAboveTitle?: string; serverProcessedContent?: unknown; alternativeText?: string }
    | undefined

  const sections = walkCanvas(raw.canvasLayout)

  // Some pages put the hero in titleArea rather than a vertical/horizontal section.
  const heroFromTitle = extractHeroFromTitleArea(titleArea, summary.title, description)
  if (heroFromTitle) {
    sections.unshift({
      id: 'hero',
      layout: 'fullWidth',
      columnCount: 1,
      blocks: [{ columnIndex: 0, block: heroFromTitle }],
    })
  }

  return {
    id: summary.id,
    slug: summary.slug,
    title: summary.title,
    description,
    webUrl: summary.webUrl,
    lastModifiedDateTime: summary.lastModifiedDateTime,
    sections,
  }
}

// -----------------------------------------------------------------------------
// canvasLayout walkers
// -----------------------------------------------------------------------------

function walkCanvas(canvasLayout: unknown): Section[] {
  if (!canvasLayout || typeof canvasLayout !== 'object') return []
  const cl = canvasLayout as {
    horizontalSections?: unknown[]
    verticalSection?: { webparts?: unknown[] } | null
  }

  const sections: Section[] = []

  if (Array.isArray(cl.horizontalSections)) {
    cl.horizontalSections.forEach((section, index) => {
      const built = walkHorizontalSection(section, index)
      if (built) sections.push(built)
    })
  }

  if (cl.verticalSection && Array.isArray(cl.verticalSection.webparts)) {
    const blocks: BlockWithPosition[] = []
    for (const wp of cl.verticalSection.webparts) {
      const block = normalizeWebPart(wp)
      if (block) blocks.push({ columnIndex: 0, block })
    }
    if (blocks.length > 0) {
      sections.push({
        id: 'vertical',
        layout: 'vertical',
        columnCount: 1,
        blocks,
      })
    }
  }

  return sections
}

function walkHorizontalSection(raw: unknown, index: number): Section | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const s = raw as { layout?: string; columns?: unknown[] }

  const columns = Array.isArray(s.columns) ? s.columns : []
  const columnCount = columns.length || 1
  const layout = mapLayout(s.layout, columnCount)

  const blocks: BlockWithPosition[] = []

  columns.forEach((rawCol, columnIndex) => {
    if (!rawCol || typeof rawCol !== 'object') return
    const col = rawCol as { webparts?: unknown[] }
    if (!Array.isArray(col.webparts)) return

    for (const wp of col.webparts) {
      const block = normalizeWebPart(wp)
      if (block) blocks.push({ columnIndex, block })
    }
  })

  if (blocks.length === 0) return undefined

  return {
    id: `section-${index}`,
    layout,
    columnCount,
    blocks,
  }
}

function mapLayout(rawLayout: string | undefined, columnCount: number): SectionLayout {
  switch (rawLayout) {
    case 'oneColumn':
      return 'oneColumn'
    case 'twoColumn':
      return 'twoColumn'
    case 'threeColumn':
      return 'threeColumn'
    case 'oneThirdLeftColumn':
      return 'oneThirdLeftColumn'
    case 'oneThirdRightColumn':
      return 'oneThirdRightColumn'
    case 'fullWidth':
      return 'fullWidth'
    default:
      if (columnCount === 1) return 'oneColumn'
      if (columnCount === 2) return 'twoColumn'
      if (columnCount === 3) return 'threeColumn'
      return 'unknown'
  }
}

// -----------------------------------------------------------------------------
// web part normalizers
// -----------------------------------------------------------------------------

function normalizeWebPart(raw: unknown): Block | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const wp = raw as Record<string, unknown>
  const odataType = typeof wp['@odata.type'] === 'string' ? (wp['@odata.type'] as string) : undefined

  // text web part
  if (odataType === '#microsoft.graph.textWebPart') {
    const innerHtml = typeof wp.innerHtml === 'string' ? wp.innerHtml : ''
    return makeTextBlock(innerHtml)
  }

  // standard / image / video / link web parts come through as standardWebPart with a webPartType id
  if (odataType === '#microsoft.graph.standardWebPart') {
    return normalizeStandardWebPart(wp)
  }

  // titleWebPart and other unknowns fall through
  if (typeof odataType === 'string') {
    return {
      kind: 'unknown',
      webPartType: odataType,
      raw: wp,
    }
  }

  return undefined
}

function makeTextBlock(html: string): TextBlock {
  return {
    kind: 'text',
    html,
    plain: htmlToPlain(html),
  }
}

function normalizeStandardWebPart(wp: Record<string, unknown>): Block {
  const webPartType = typeof wp.webPartType === 'string' ? (wp.webPartType as string) : 'unknown'
  const data = (wp.data ?? {}) as Record<string, unknown>
  const properties = (data.properties ?? {}) as Record<string, unknown>
  const dataTitle = typeof data.title === 'string' ? (data.title as string) : undefined
  const dataDescription = typeof data.description === 'string' ? (data.description as string) : undefined

  const knownType = identifyKnownWebPart(webPartType)
  switch (knownType) {
    case 'image':
      return makeImageBlock(properties, dataTitle, dataDescription)
    case 'youtube':
    case 'vimeo':
    case 'streamEmbed':
    case 'embed':
      return makeEmbedBlock(properties, knownType)
    case 'quickLinks':
      return makeQuickLinksBlock(properties, dataTitle)
    case 'hero':
      return makeHeroBlock(properties)
    case 'callToAction':
      return makeLinkBlock(properties, dataTitle, dataDescription)
    default:
      return {
        kind: 'unknown',
        webPartType,
        title: dataTitle,
        description: dataDescription,
        raw: wp,
      } satisfies UnknownBlock
  }
}

/**
 * SharePoint identifies first-party web parts by stable GUIDs. We map the most common ones we
 * care about for migration. Unknown GUIDs fall back to `unknown` and surface as warnings later.
 *
 * Reference: https://github.com/SharePoint/sp-dev-docs/issues/8120 and
 * https://learn.microsoft.com/en-us/sharepoint/dev/spfx/web-parts/web-part-identifiers
 */
const WEB_PART_GUIDS: Record<string, string> = {
  'd1d91016-032f-456d-98a4-721247c305e8': 'image',
  '544dd15b-cf3c-441b-96da-004d5a8cea1d': 'youtube',
  '0db5d2bd-9bb1-4d13-883c-7d019d5d6c2c': 'vimeo',
  'eb95c819-ab8f-4689-bd03-0c2d65d47b1f': 'streamEmbed',
  '490d7c76-1824-45b2-9de3-676421c997fa': 'embed',
  'c70391ea-0b10-4ee9-b2b4-006d3fcad0cd': 'quickLinks',
  'c4bd7b2f-7b6e-4599-8485-16504575f590': 'hero',
  'df8e6c0b-20b9-411a-8a25-3fbd7d7a0e29': 'callToAction',
}

type KnownWebPart = (typeof WEB_PART_GUIDS)[keyof typeof WEB_PART_GUIDS]

function identifyKnownWebPart(webPartType: string): KnownWebPart | undefined {
  return WEB_PART_GUIDS[webPartType.toLowerCase()]
}

function makeImageBlock(
  properties: Record<string, unknown>,
  fallbackTitle?: string,
  fallbackDescription?: string,
): ImageBlock {
  const url = pickString(properties, ['imageSourceType', 'imageUrl', 'siteId', 'webId', 'src']) // best-effort
  // The "imageUrl" property carries the actual sharepoint download URL on most tenants.
  const imageUrl = pickString(properties, ['imageUrl']) ?? pickString(properties, ['src'])
  const alt = pickString(properties, ['altText', 'alternateText']) ?? fallbackTitle
  const caption = pickString(properties, ['captionText']) ?? fallbackDescription

  return {
    kind: 'image',
    localPath: '',
    sourceUrl: imageUrl ?? url,
    alt: alt && alt.length > 0 ? alt : undefined,
    caption: caption && caption.length > 0 ? caption : undefined,
    width: pickNumber(properties, ['imageWidth', 'fixedWidth']),
    height: pickNumber(properties, ['imageHeight', 'fixedHeight']),
  }
}

function makeEmbedBlock(properties: Record<string, unknown>, provider: string): EmbedBlock {
  const url = pickString(properties, ['embedCode', 'url', 'videoSource'])
  // For oEmbed-based parts the embed code is HTML; try to pull a src out of it.
  const cleaned = url && /<iframe/i.test(url) ? extractIframeSrc(url) : url
  return {
    kind: 'embed',
    url: cleaned ?? url ?? '',
    provider,
    title: pickString(properties, ['title']),
  }
}

function makeQuickLinksBlock(properties: Record<string, unknown>, title?: string): UnknownBlock {
  // Quick Links is a complex grid; we surface it as `unknown` so the translator decides.
  return {
    kind: 'unknown',
    webPartType: 'quickLinks',
    title,
    raw: properties,
  }
}

function makeHeroBlock(properties: Record<string, unknown>): HeroBlock {
  return {
    kind: 'hero',
    imageSourceUrl: pickString(properties, ['imageUrl', 'src']),
    heading: pickString(properties, ['title', 'heading']),
    subheading: pickString(properties, ['description', 'subtitle']),
  }
}

function makeLinkBlock(
  properties: Record<string, unknown>,
  fallbackTitle?: string,
  fallbackDescription?: string,
): LinkBlock {
  return {
    kind: 'link',
    url: pickString(properties, ['url', 'link', 'targetUrl']) ?? '',
    title: pickString(properties, ['title']) ?? fallbackTitle,
    description: pickString(properties, ['description']) ?? fallbackDescription,
  }
}

function extractHeroFromTitleArea(
  titleArea:
    | { textAboveTitle?: string; serverProcessedContent?: unknown; alternativeText?: string }
    | undefined,
  pageTitle: string,
  pageDescription: string | undefined,
): HeroBlock | undefined {
  // titleArea exists on most modern SharePoint pages; if it carries an image we surface it as a hero.
  if (!titleArea) return undefined
  const spc = (titleArea.serverProcessedContent ?? {}) as Record<string, unknown>
  const imageSources = (spc.imageSources ?? {}) as Record<string, unknown>
  const heroImage =
    typeof imageSources.imageSource === 'string' ? (imageSources.imageSource as string) : undefined

  if (!heroImage && !titleArea.textAboveTitle) return undefined

  return {
    kind: 'hero',
    imageSourceUrl: heroImage,
    heading: pageTitle,
    subheading: titleArea.textAboveTitle ?? pageDescription,
  }
}

// -----------------------------------------------------------------------------
// helpers
// -----------------------------------------------------------------------------

function pickString(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'string' && v.length > 0) return v
  }
  return undefined
}

function pickNumber(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const v = obj[key]
    if (typeof v === 'number' && Number.isFinite(v)) return v
  }
  return undefined
}

function extractIframeSrc(html: string): string | undefined {
  const match = html.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i)
  return match?.[1]
}

function htmlToPlain(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
