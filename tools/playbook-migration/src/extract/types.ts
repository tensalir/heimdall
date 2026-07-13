/**
 * Canonical, hand-typed shapes for extracted SharePoint content.
 *
 * Microsoft Graph's published types in @microsoft/microsoft-graph-types are loose
 * (lots of `any`). We normalize into this internal shape so everything downstream
 * (translator, author) reads from a single, strict contract.
 */

export type SectionLayout =
  | 'oneColumn'
  | 'twoColumn'
  | 'threeColumn'
  | 'oneThirdLeftColumn'
  | 'oneThirdRightColumn'
  | 'fullWidth'
  | 'vertical'
  | 'unknown'

export type Block =
  | TextBlock
  | ImageBlock
  | EmbedBlock
  | LinkBlock
  | HeroBlock
  | UnknownBlock

export interface TextBlock {
  kind: 'text'
  /** Original innerHtml from the SharePoint Text web part. */
  html: string
  /** Plain text rendition (whitespace-collapsed). Useful for previews and warnings. */
  plain: string
}

export interface ImageBlock {
  kind: 'image'
  /** Path relative to TOOL_ROOT (e.g. assets/<slug>/cover.png). Empty until the downloader runs. */
  localPath: string
  /** Original SharePoint image URL. Kept so we can retry the download if needed. */
  sourceUrl?: string
  alt?: string
  caption?: string
  /** Width/height the image was rendered at in SharePoint, if known. */
  width?: number
  height?: number
}

export interface EmbedBlock {
  kind: 'embed'
  url: string
  /** YouTube / Vimeo / SharePoint Stream / generic. */
  provider?: string
  title?: string
}

export interface LinkBlock {
  kind: 'link'
  url: string
  title?: string
  description?: string
}

export interface HeroBlock {
  kind: 'hero'
  /** Optional background image asset. */
  imageLocalPath?: string
  imageSourceUrl?: string
  /** Heading text rendered on the hero. */
  heading?: string
  /** Subheading / supporting text. */
  subheading?: string
}

export interface UnknownBlock {
  kind: 'unknown'
  webPartType: string
  /** Title/description Graph returned for the standardWebPart, if any. */
  title?: string
  description?: string
  /** Raw `data` property from Graph so a future iteration can parse it without re-extraction. */
  raw: unknown
}

export interface Section {
  /** Stable identifier within the page. Vertical sections are 'vertical'; horizontals are by index. */
  id: string
  layout: SectionLayout
  /** Number of columns Graph reported for the section. */
  columnCount: number
  /**
   * Blocks in document order. For multi-column sections, blocks are emitted column-by-column,
   * left-to-right, with a synthetic `kind: 'columnBreak'` marker between them is *not* added —
   * instead, each block carries `columnIndex`.
   */
  blocks: BlockWithPosition[]
}

export interface BlockWithPosition {
  /** 0-based column index this block originated from. */
  columnIndex: number
  block: Block
}

export interface PageContent {
  /** Microsoft Graph site page id. */
  id: string
  /** URL-safe slug derived from the title. Used for filenames. */
  slug: string
  /** Page title as authored in SharePoint. */
  title: string
  /** Optional subtitle / description. */
  description?: string
  /** Original SharePoint web URL of the page. */
  webUrl?: string
  /** Last-modified timestamp from Graph. */
  lastModifiedDateTime?: string
  sections: Section[]
}
