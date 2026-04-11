/**
 * Nano Banana (Gemini) image generation client for Iterator.
 *
 * Ported from Vesper's GeminiAdapter pattern. Supports both Nano Banana Pro
 * (Gemini 3 Pro Image) and Nano Banana 2 (Gemini 3.1 Flash Image) with
 * the same API shape, error handling, and retry logic.
 *
 * Fallback chain: Gemini API REST → error (no Vertex AI or Replicate in v1).
 * Add Vertex AI and Replicate fallbacks as needed.
 *
 * Reference: https://ai.google.dev/gemini-api/docs/image-generation
 */

import type { GenerationBrief } from '../types'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/**
 * Internal model ID → Gemini API model name.
 * These are the only two image models we support.
 */
const MODEL_MAP: Record<string, string> = {
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'nano-banana-2': 'gemini-3.1-flash-image-preview',
}

/**
 * Supported aspect ratios per model.
 * Nano Banana 2 (Flash) supports more ratios than Pro.
 */
export const SUPPORTED_ASPECT_RATIOS: Record<string, string[]> = {
  'nano-banana-pro': ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  'nano-banana-2': ['1:1', '1:4', '1:8', '2:3', '3:2', '3:4', '4:1', '4:3', '4:5', '5:4', '8:1', '9:16', '16:9', '21:9'],
}

/**
 * Supported resolutions per model.
 * Nano Banana 2 adds 512px (0.5K) option.
 */
export const SUPPORTED_RESOLUTIONS: Record<string, string[]> = {
  'nano-banana-pro': ['1K', '2K', '4K'],
  'nano-banana-2': ['512', '1K', '2K', '4K'],
}

const MAX_RETRY_ATTEMPTS = Number(process.env.MAX_RETRY_ATTEMPTS || '3')
const IMAGE_GENERATION_DELAY_MS = Number(process.env.IMAGE_GENERATION_DELAY_MS || '2000')

export interface NanoBananaResult {
  imageBase64: string | null
  mimeType: string | null
  text: string | null
  error: string | null
  model: string
  safetyBlocked: boolean
}

export interface NanoBananaModelInfo {
  id: string
  apiModelName: string
  displayName: string
  supportedAspectRatios: string[]
  supportedResolutions: string[]
  maxReferenceImages: number
}

export function getModelInfo(modelId: string): NanoBananaModelInfo {
  const apiModel = MODEL_MAP[modelId]
  if (!apiModel) {
    throw new Error(`Unknown model: ${modelId}. Supported: ${Object.keys(MODEL_MAP).join(', ')}`)
  }
  return {
    id: modelId,
    apiModelName: apiModel,
    displayName: modelId === 'nano-banana-pro' ? 'Nano Banana Pro' : 'Nano Banana 2',
    supportedAspectRatios: SUPPORTED_ASPECT_RATIOS[modelId] || [],
    supportedResolutions: SUPPORTED_RESOLUTIONS[modelId] || [],
    maxReferenceImages: modelId === 'nano-banana-2' ? 14 : 14,
  }
}

export function getAvailableModels(): NanoBananaModelInfo[] {
  return Object.keys(MODEL_MAP).map(getModelInfo)
}

function isRateLimitError(status: number, body: string): boolean {
  return status === 429 || body.includes('RESOURCE_EXHAUSTED')
}

function isTransientError(status: number): boolean {
  return [502, 503, 504].includes(status)
}

function isQuotaExhaustedError(body: string): boolean {
  const lower = body.toLowerCase()
  return (
    lower.includes('limit: 0') ||
    lower.includes('limit":0') ||
    lower.includes('daily quota') ||
    lower.includes('exceeded your current quota') ||
    lower.includes('quota exceeded')
  )
}

/**
 * Parse Gemini response for safety blocks.
 * Google can return 200 OK with no image when content is blocked.
 */
function parseSafetyBlock(data: Record<string, unknown>): string | null {
  const promptFeedback = data?.promptFeedback as Record<string, unknown> | undefined
  if (promptFeedback?.blockReason) {
    return `Prompt blocked by safety filter: ${promptFeedback.blockReason}`
  }

  const candidates = data?.candidates as Array<Record<string, unknown>> | undefined
  const finishReason = candidates?.[0]?.finishReason as string | undefined
  const blockedReasons = ['SAFETY', 'RECITATION', 'BLOCKLIST', 'PROHIBITED_CONTENT', 'SPII', 'IMAGE_SAFETY']
  if (finishReason && blockedReasons.includes(finishReason)) {
    return `Generation blocked by content safety filter: ${finishReason}. Try rephrasing the prompt.`
  }

  return null
}

/**
 * Generate a single image using the Gemini API.
 * Includes retry logic with exponential backoff for rate limits
 * and linear backoff for transient errors.
 */
export async function generateImage(
  brief: GenerationBrief,
  modelId = 'nano-banana-2',
): Promise<NanoBananaResult> {
  const apiKey = process.env.ITERATOR_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { imageBase64: null, mimeType: null, text: null, error: 'Neither ITERATOR_GEMINI_API_KEY nor GEMINI_API_KEY is configured', model: modelId, safetyBlocked: false }
  }

  const apiModelName = MODEL_MAP[modelId]
  if (!apiModelName) {
    return { imageBase64: null, mimeType: null, text: null, error: `Unknown model: ${modelId}`, model: modelId, safetyBlocked: false }
  }

  const url = `${GEMINI_API_BASE}/${apiModelName}:generateContent?key=${apiKey}`

  const contentParts: Array<Record<string, unknown>> = [{ text: brief.prompt }]

  for (const refUrl of brief.referenceImageUrls) {
    const imageData = await fetchImageAsBase64(refUrl)
    if (imageData) {
      contentParts.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64,
        },
      })
    }
  }

  const body = {
    contents: [{ parts: contentParts }],
    generationConfig: {
      responseModalities: ['IMAGE'],
      temperature: 1.0,
      imageConfig: {
        aspectRatio: brief.aspectRatio,
        imageSize: brief.resolution,
      },
    },
  }

  for (let attempt = 0; attempt < MAX_RETRY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      const responseText = await response.text()

      if (!response.ok) {
        if (isRateLimitError(response.status, responseText)) {
          const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 1000
          console.warn(`[NanoBanana] Rate limited (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}), backing off ${Math.round(backoff)}ms`)
          await sleep(backoff)
          continue
        }

        if (isTransientError(response.status)) {
          const backoff = Math.min((attempt + 1) * 2000, 16000)
          console.warn(`[NanoBanana] Transient error ${response.status} (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}), backing off ${backoff}ms`)
          await sleep(backoff)
          continue
        }

        if (isQuotaExhaustedError(responseText)) {
          return { imageBase64: null, mimeType: null, text: null, error: 'Gemini API quota exhausted. Try again later or switch models.', model: modelId, safetyBlocked: false }
        }

        return { imageBase64: null, mimeType: null, text: null, error: `Gemini API error ${response.status}: ${responseText.substring(0, 500)}`, model: modelId, safetyBlocked: false }
      }

      let data: Record<string, unknown>
      try {
        data = JSON.parse(responseText)
      } catch {
        return { imageBase64: null, mimeType: null, text: null, error: 'Failed to parse Gemini response as JSON', model: modelId, safetyBlocked: false }
      }

      const safetyError = parseSafetyBlock(data)
      if (safetyError) {
        return { imageBase64: null, mimeType: null, text: null, error: safetyError, model: modelId, safetyBlocked: true }
      }

      const candidates = data.candidates as Array<{ content: { parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }> } }> | undefined
      const parts = candidates?.[0]?.content?.parts || []

      let imageBase64: string | null = null
      let imageMimeType: string | null = null
      let text: string | null = null

      for (const part of parts) {
        if (part.text) text = part.text
        if (part.inlineData?.data && part.inlineData.mimeType?.startsWith('image/')) {
          imageBase64 = part.inlineData.data
          imageMimeType = part.inlineData.mimeType
        }
      }

      if (!imageBase64) {
        return { imageBase64: null, mimeType: null, text, error: 'Gemini returned no image data. The prompt may need adjustment.', model: modelId, safetyBlocked: false }
      }

      return { imageBase64, mimeType: imageMimeType, text, error: null, model: modelId, safetyBlocked: false }

    } catch (err) {
      const msg = (err as Error).message || 'Unknown error'
      if (attempt < MAX_RETRY_ATTEMPTS - 1 && (msg.includes('fetch failed') || msg.includes('ECONNRESET') || msg.includes('socket hang up'))) {
        const backoff = Math.min((attempt + 1) * 2000, 16000)
        console.warn(`[NanoBanana] Network error (attempt ${attempt + 1}/${MAX_RETRY_ATTEMPTS}): ${msg}, backing off ${backoff}ms`)
        await sleep(backoff)
        continue
      }
      return { imageBase64: null, mimeType: null, text: null, error: `Gemini request failed: ${msg}`, model: modelId, safetyBlocked: false }
    }
  }

  return { imageBase64: null, mimeType: null, text: null, error: `All ${MAX_RETRY_ATTEMPTS} retry attempts exhausted`, model: modelId, safetyBlocked: false }
}

/**
 * Generate multiple images sequentially with delay between each.
 * Avoids rate-limit storms when generating batches.
 */
export async function generateBatch(
  briefs: GenerationBrief[],
  modelId = 'nano-banana-2',
): Promise<NanoBananaResult[]> {
  const results: NanoBananaResult[] = []

  for (let i = 0; i < briefs.length; i++) {
    if (i > 0) {
      await sleep(IMAGE_GENERATION_DELAY_MS)
    }
    const result = await generateImage(briefs[i], modelId)
    results.push(result)
  }

  return results
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
  if (url.startsWith('data:')) {
    const match = url.match(/^data:([^;]+);base64,(.+)$/)
    if (match) {
      return { mimeType: match[1], base64: match[2] }
    }
    return null
  }

  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mimeType = response.headers.get('content-type') || 'image/png'
    return { base64, mimeType }
  } catch {
    return null
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
