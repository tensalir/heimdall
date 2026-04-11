/**
 * Nano Banana (Gemini) image generation client for Iterator.
 *
 * Wraps the Gemini generateContent API for image generation and editing.
 * Reuses the Vesper client pattern but adds Iterator-specific configuration
 * like reference image handling (up to 14) and aspect ratio control.
 */

import type { GenerationBrief } from '../types'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

const MODEL_MAP: Record<string, string> = {
  'nano-banana-pro': 'gemini-3-pro-image-preview',
  'nano-banana-flash': 'gemini-3.1-flash-image-preview',
}

export interface NanoBananaResult {
  imageBase64: string | null
  text: string | null
  error: string | null
}

export async function generateImage(brief: GenerationBrief, model = 'nano-banana-flash'): Promise<NanoBananaResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { imageBase64: null, text: null, error: 'GEMINI_API_KEY not configured' }
  }

  const modelId = MODEL_MAP[model] || model
  const url = `${GEMINI_API_BASE}/${modelId}:generateContent`

  const contents: unknown[] = [{ text: brief.prompt }]

  for (const refUrl of brief.referenceImageUrls) {
    const imageData = await fetchImageAsBase64(refUrl)
    if (imageData) {
      contents.push({
        inlineData: {
          mimeType: imageData.mimeType,
          data: imageData.base64,
        },
      })
    }
  }

  const body = {
    contents: [{ parts: contents }],
    generationConfig: {
      responseModalities: ['TEXT', 'IMAGE'],
      imageConfig: {
        aspectRatio: mapAspectRatio(brief.aspectRatio),
        imageSize: brief.resolution,
      },
    },
  }

  try {
    const response = await fetch(`${url}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorText = await response.text()
      return { imageBase64: null, text: null, error: `Gemini API error ${response.status}: ${errorText}` }
    }

    const data = await response.json() as { candidates?: Array<{ content: { parts: Array<{ text?: string; inlineData?: { data: string } }> } }> }
    const parts = data.candidates?.[0]?.content?.parts || []

    let imageBase64: string | null = null
    let text: string | null = null

    for (const part of parts) {
      if (part.text) text = part.text
      if (part.inlineData?.data) imageBase64 = part.inlineData.data
    }

    return { imageBase64, text, error: null }
  } catch (err) {
    return { imageBase64: null, text: null, error: `Gemini request failed: ${(err as Error).message}` }
  }
}

function mapAspectRatio(ratio: string): string {
  const map: Record<string, string> = { '4:5': '4:5', '9:16': '9:16', '1:1': '1:1' }
  return map[ratio] || ratio
}

async function fetchImageAsBase64(url: string): Promise<{ base64: string; mimeType: string } | null> {
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
