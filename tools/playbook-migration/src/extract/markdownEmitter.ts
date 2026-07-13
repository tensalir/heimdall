import TurndownService from 'turndown'

import type { Block, BlockWithPosition, PageContent, Section } from './types.js'

const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
})

// SharePoint Text web parts often use spans with inline styles for emphasis.
// Turndown leaves those as raw HTML, which is noisy. Strip them so we get clean Markdown.
turndown.addRule('strip-inline-styles', {
  filter: (node) => node.nodeName === 'SPAN' && (node as Element).getAttributeNames().length > 0,
  replacement: (content) => content,
})

/**
 * Render a PageContent as a clean Markdown document. Two audiences:
 * 1. Humans reviewing the extraction quality.
 * 2. Gabriel using it as a paste-source while the author stage is being built.
 */
export function renderPageMarkdown(page: PageContent): string {
  const lines: string[] = []
  lines.push(`# ${page.title}`)
  lines.push('')
  if (page.description) {
    lines.push(`> ${page.description}`)
    lines.push('')
  }

  const meta: string[] = []
  if (page.webUrl) meta.push(`Source: <${page.webUrl}>`)
  if (page.lastModifiedDateTime) meta.push(`Last modified: ${page.lastModifiedDateTime}`)
  if (meta.length > 0) {
    lines.push(meta.map((m) => `_${m}_`).join('  \n'))
    lines.push('')
  }

  for (const section of page.sections) {
    lines.push(...renderSection(section))
    lines.push('')
  }

  return `${lines.join('\n').trimEnd()}\n`
}

function renderSection(section: Section): string[] {
  const lines: string[] = []
  lines.push(`<!-- section ${section.id} layout=${section.layout} columns=${section.columnCount} -->`)

  if (section.columnCount > 1) {
    // Group by column for readability, but keep document order within each column.
    const columns = groupByColumn(section.blocks, section.columnCount)
    columns.forEach((blocks, idx) => {
      lines.push(`<!-- column ${idx + 1} of ${section.columnCount} -->`)
      for (const b of blocks) lines.push(...renderBlock(b))
      lines.push('')
    })
  } else {
    for (const { block } of section.blocks) lines.push(...renderBlock(block))
  }

  return lines
}

function groupByColumn(blocks: BlockWithPosition[], columnCount: number): Block[][] {
  const out: Block[][] = Array.from({ length: columnCount }, () => [])
  for (const { columnIndex, block } of blocks) {
    const idx = Math.min(Math.max(columnIndex, 0), columnCount - 1)
    out[idx]!.push(block)
  }
  return out
}

function renderBlock(block: Block): string[] {
  switch (block.kind) {
    case 'text':
      return [turndown.turndown(block.html), '']
    case 'image': {
      const alt = block.alt ?? 'image'
      const src = block.localPath || block.sourceUrl || ''
      const lines = [`![${alt}](${src})`]
      if (block.caption) lines.push(`_${block.caption}_`)
      lines.push('')
      return lines
    }
    case 'embed': {
      const label = block.title ?? block.provider ?? 'embed'
      return [`> Embed (${label}): <${block.url}>`, '']
    }
    case 'link': {
      const title = block.title ?? block.url
      const lines = [`> Link: [${title}](${block.url})`]
      if (block.description) lines.push(`> ${block.description}`)
      lines.push('')
      return lines
    }
    case 'hero': {
      const lines: string[] = []
      lines.push('<!-- hero -->')
      if (block.imageLocalPath ?? block.imageSourceUrl) {
        lines.push(`![hero](${block.imageLocalPath ?? block.imageSourceUrl})`)
      }
      if (block.heading) lines.push(`## ${block.heading}`)
      if (block.subheading) lines.push(block.subheading)
      lines.push('')
      return lines
    }
    case 'unknown':
      return [
        `<!-- unknown web part: ${block.webPartType}${block.title ? ` (${block.title})` : ''} -->`,
        '',
      ]
  }
}
