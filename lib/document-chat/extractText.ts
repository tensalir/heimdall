import * as XLSX from 'xlsx'
import { isLlamaParseConfigured, parseWithLlamaParse } from './llamaparse.js'

function extension(filename: string): string {
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i + 1).toLowerCase() : ''
}

function extractXlsx(buf: Buffer): string {
  const wb = XLSX.read(buf, { type: 'buffer' })
  const parts: string[] = []
  for (const name of wb.SheetNames) {
    const sheet = wb.Sheets[name]
    if (!sheet) continue
    const csv = XLSX.utils.sheet_to_csv(sheet)
    if (csv.trim()) parts.push(`## ${name}\n${csv}`)
  }
  return parts.join('\n\n')
}

const LLAMA_EXTENSIONS = new Set(['pdf', 'docx', 'pptx', 'ppt', 'xlsx', 'xls'])

export interface ExtractDocumentResult {
  /** Full text / markdown for chunking and storage. */
  text: string
  /** Use heading-aware chunking (LlamaParse output or markdown files). */
  useMarkdownChunking: boolean
}

/**
 * Extract document text; prefers LlamaParse for office/binary formats when configured.
 */
export async function extractDocumentContent(
  filename: string,
  buf: Buffer,
): Promise<ExtractDocumentResult> {
  const ext = extension(filename)

  if (['txt', 'csv', 'json'].includes(ext)) {
    return { text: buf.toString('utf8'), useMarkdownChunking: false }
  }

  if (ext === 'md' || ext === 'markdown') {
    return { text: buf.toString('utf8'), useMarkdownChunking: true }
  }

  if (LLAMA_EXTENSIONS.has(ext) && isLlamaParseConfigured()) {
    try {
      const text = await parseWithLlamaParse(filename, buf)
      return { text, useMarkdownChunking: true }
    } catch {
      // fall through to local parsers
    }
  }

  if (['xlsx', 'xls'].includes(ext)) {
    return { text: extractXlsx(buf), useMarkdownChunking: true }
  }

  if (ext === 'pdf') {
    const { PDFParse } = await import('pdf-parse')
    const parser = new PDFParse({ data: new Uint8Array(buf) })
    try {
      const textResult = await parser.getText()
      return { text: (textResult.text ?? '').trim(), useMarkdownChunking: false }
    } finally {
      await parser.destroy()
    }
  }

  if (ext === 'docx') {
    const mammoth = await import('mammoth')
    const result = await mammoth.extractRawText({ buffer: buf })
    const text = result.value ?? ''
    return { text, useMarkdownChunking: text.includes('#') }
  }

  throw new Error(
    `Unsupported file type: .${ext || 'unknown'} (supported: txt, md, csv, json, pdf, docx, pptx, xlsx, xls; ppt requires LlamaParse when configured)`,
  )
}

/** @deprecated Use extractDocumentContent for chunking hints */
export async function extractTextFromFile(filename: string, buf: Buffer): Promise<string> {
  const r = await extractDocumentContent(filename, buf)
  return r.text
}
