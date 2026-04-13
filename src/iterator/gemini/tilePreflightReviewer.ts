/**
 * Backend tile preflight reviewer.
 *
 * Runs before Figma placement: takes the full generated source image,
 * simulates a center-crop at the target rect's aspect ratio using sharp,
 * then sends both images to Gemini for a source-aware framing judgment.
 *
 * Returns normalized zoom/pan instructions that the plugin can apply
 * via applyCropToRect on first placement.
 */

import sharp from 'sharp'
import type { TileFramingResult } from '../types.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const REVIEW_MODEL = 'gemini-2.5-flash-preview-05-20'

const PREFLIGHT_PROMPT = `You are a senior art director at a performance marketing agency. You are reviewing a portrait lifestyle photo BEFORE it is placed into an ad tile.

You will see two images:
1. FIRST: the full uncropped source image — this is what we generated
2. SECOND: a simulated center-crop showing how it would look placed in the ad tile at the target aspect ratio

Your job: decide whether the simulated crop is acceptable, or whether the image needs to be zoomed out and/or repositioned so the person's face is clearly visible with good framing.

Respond with ONLY a JSON object (no markdown, no explanation outside the JSON):

{
  "action": "keep" or "adjust",
  "zoomDelta": number between -0.4 and 0 (negative = zoom out to show more, 0 = no change),
  "panX": number between -0.3 and 0.3 (negative = pan left, positive = pan right),
  "panY": number between -0.3 and 0.3 (negative = pan up, positive = pan down),
  "confidence": "high", "medium", or "low",
  "reason": "brief explanation"
}

Art direction rules:
- Respond "adjust" if: forehead is cut off, top of hair is missing, only partial face visible, face fills the entire tile with no breathing room, or the full source image clearly has more usable face/body that the crop hides
- Prefer showing: full head (including hair and forehead), eyes, nose, mouth, chin, and shoulders — with breathing room above the head
- A slightly wider crop is almost always better than a tighter one for portrait lifestyle tiles in paid social ads
- zoomDelta of -0.15 is moderate; -0.25 is a comfortable wider view; -0.35 is aggressive
- Use panY (negative = shift viewport up to reveal more head/face, positive = shift down) when the face is positioned off-center
- For sleeping/resting poses, the face should still be clearly recognizable even if not perfectly centered
- Only respond "keep" if the simulated crop already shows the face well-framed with visible headroom`

interface PreflightInput {
  sourceImageBase64: string
  mimeType: string
  rectWidth: number
  rectHeight: number
}

export async function reviewTilePreflight(input: PreflightInput): Promise<TileFramingResult> {
  const apiKey = process.env.ITERATOR_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return fallback('No Gemini API key configured')
  }

  let simulatedCropBase64: string
  let sourceWidth: number
  let sourceHeight: number

  try {
    const srcBuffer = Buffer.from(input.sourceImageBase64, 'base64')
    const metadata = await sharp(srcBuffer).metadata()
    sourceWidth = metadata.width || 1
    sourceHeight = metadata.height || 1

    const targetAR = input.rectWidth / input.rectHeight
    const sourceAR = sourceWidth / sourceHeight

    let cropW: number
    let cropH: number
    if (sourceAR > targetAR) {
      cropH = sourceHeight
      cropW = Math.round(sourceHeight * targetAR)
    } else {
      cropW = sourceWidth
      cropH = Math.round(sourceWidth / targetAR)
    }

    const cropX = Math.round((sourceWidth - cropW) / 2)
    const cropY = Math.round((sourceHeight - cropH) / 2)

    const croppedBuffer = await sharp(srcBuffer)
      .extract({
        left: Math.max(0, cropX),
        top: Math.max(0, cropY),
        width: Math.min(cropW, sourceWidth),
        height: Math.min(cropH, sourceHeight),
      })
      .resize(Math.min(input.rectWidth, 800), null, { fit: 'inside' })
      .png()
      .toBuffer()

    simulatedCropBase64 = croppedBuffer.toString('base64')
  } catch (err) {
    return fallback(`Sharp crop simulation failed: ${(err as Error).message}`)
  }

  const sizeNote = `\nTarget tile: ${input.rectWidth}x${input.rectHeight}px. Source image: ${sourceWidth}x${sourceHeight}px.`

  const url = `${GEMINI_API_BASE}/${REVIEW_MODEL}:generateContent?key=${apiKey}`

  const body = {
    contents: [{
      parts: [
        { text: PREFLIGHT_PROMPT + sizeNote },
        {
          inlineData: {
            mimeType: input.mimeType,
            data: input.sourceImageBase64,
          },
        },
        {
          inlineData: {
            mimeType: 'image/png',
            data: simulatedCropBase64,
          },
        },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 256,
    },
  }

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.warn(`[tilePreflightReviewer] Gemini error ${response.status}: ${errText.substring(0, 200)}`)
      return fallback(`Gemini API error ${response.status}`)
    }

    const data = await response.json() as Record<string, unknown>
    const candidates = data.candidates as Array<{
      content: { parts: Array<{ text?: string }> }
    }> | undefined
    const text = candidates?.[0]?.content?.parts?.[0]?.text

    if (!text) {
      return fallback('Gemini returned no text response')
    }

    return parseResponse(text)
  } catch (err) {
    console.warn('[tilePreflightReviewer] Request failed:', (err as Error).message)
    return fallback(`Request failed: ${(err as Error).message}`)
  }
}

function parseResponse(text: string): TileFramingResult {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    return {
      action: parsed.action === 'adjust' ? 'adjust' : 'keep',
      zoomDelta: clamp(Number(parsed.zoomDelta) || 0, -0.4, 0),
      panX: clamp(Number(parsed.panX) || 0, -0.3, 0.3),
      panY: clamp(Number(parsed.panY) || 0, -0.3, 0.3),
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence)
        ? (parsed.confidence as 'high' | 'medium' | 'low')
        : 'low',
      reason: String(parsed.reason || 'No reason provided').substring(0, 200),
    }
  } catch {
    return fallback('Failed to parse preflight response as JSON')
  }
}

function fallback(reason: string): TileFramingResult {
  return {
    action: 'keep',
    zoomDelta: -0.15,
    panX: 0,
    panY: 0,
    confidence: 'low',
    reason,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
