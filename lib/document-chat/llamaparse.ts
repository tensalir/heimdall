/**
 * LlamaParse via @llamaindex/llama-cloud (LlamaCloud API).
 * Requires LLAMA_CLOUD_API_KEY (or LLAMA_PARSE_API_KEY per SDK default).
 */

import LlamaCloud, { toFile } from '@llamaindex/llama-cloud'
import type { ParsingGetResponse } from '@llamaindex/llama-cloud/resources/parsing.js'

export type LlamaParseTier = 'fast' | 'cost_effective' | 'agentic' | 'agentic_plus'

function markdownFromResult(result: ParsingGetResponse): string {
  if (result.markdown_full?.trim()) return result.markdown_full.trim()
  const pages = result.markdown?.pages
  if (pages?.length) {
    const parts = pages
      .filter((p): p is { success: true; markdown: string; page_number: number } => p.success === true)
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => p.markdown)
    const joined = parts.join('\n\n').trim()
    if (joined) return joined
  }
  if (result.text_full?.trim()) return result.text_full.trim()
  const textPages = result.text?.pages
  if (textPages?.length) {
    const parts = [...textPages]
      .sort((a, b) => a.page_number - b.page_number)
      .map((p) => p.text)
    return parts.join('\n\n').trim()
  }
  return ''
}

function getApiKey(): string | null {
  return (
    process.env.LLAMA_CLOUD_API_KEY?.trim() ||
    process.env.LLAMA_PARSE_API_KEY?.trim() ||
    null
  )
}

function getTier(): LlamaParseTier {
  const t = process.env.LLAMA_PARSE_TIER?.trim().toLowerCase()
  if (t === 'fast' || t === 'cost_effective' || t === 'agentic' || t === 'agentic_plus') {
    return t
  }
  return 'cost_effective'
}

function getVersion(): string {
  const v = process.env.LLAMA_PARSE_VERSION?.trim()
  return v && v.length > 0 ? v : 'latest'
}

export function isLlamaParseConfigured(): boolean {
  return !!getApiKey()
}

/**
 * Parse a document buffer to Markdown (or plain text fallback).
 * Throws on API failure or empty extraction.
 */
export async function parseWithLlamaParse(filename: string, buffer: Buffer): Promise<string> {
  const apiKey = getApiKey()
  if (!apiKey) throw new Error('LLAMA_CLOUD_API_KEY is not set')

  const client = new LlamaCloud({
    apiKey,
    timeout: 600_000,
    maxRetries: 1,
  })

  const uploadFile = await toFile(buffer, filename)

  const result = await client.parsing.parse({
    tier: getTier(),
    version: getVersion() as never,
    upload_file: uploadFile,
    expand: ['markdown', 'text'],
  })

  if (result.job.status === 'FAILED') {
    throw new Error(result.job.error_message ?? 'LlamaParse job failed')
  }

  const md = markdownFromResult(result)
  if (!md) {
    throw new Error('LlamaParse returned no markdown or text')
  }
  return md
}
