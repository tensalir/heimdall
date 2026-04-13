/**
 * Multimodal placement reviewer using Gemini Flash.
 *
 * Takes a preview screenshot of a placed portrait image inside an ad frame
 * and returns structured crop/zoom guidance so the plugin can adjust the
 * image transform for better face visibility.
 */

import type { PlacementReviewRequest, CropAdjustment } from '../types.js'

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const REVIEW_MODEL = 'gemini-2.5-flash-preview-05-20'

const REVIEW_PROMPT = `You are a senior art director at a performance marketing agency reviewing portrait lifestyle photos placed inside ad tiles.

Your job is to judge whether the current crop shows enough of the person's face and upper body, and whether the source image has more usable headroom that should be revealed. Think like a designer who immediately notices when a crop is too tight and zooms out.

Respond with ONLY a JSON object (no markdown, no explanation outside the JSON):

{
  "action": "keep" or "adjust",
  "zoomDelta": number between -0.4 and 0 (negative = zoom out to show more, 0 = no change),
  "panX": number between -0.3 and 0.3 (negative = pan left, positive = pan right),
  "panY": number between -0.3 and 0.3 (negative = pan up, positive = pan down),
  "confidence": "high", "medium", or "low",
  "reason": "brief explanation"
}

Art direction guidelines:
- Default toward "adjust" if any of these are true: forehead is cut off, top of hair is missing, only partial face visible, face fills the entire tile with no breathing room, or the source image clearly contains more face/body that is being cropped away
- Prefer showing: full forehead, eyes, nose, mouth, and enough chin/jaw to read the expression — plus some breathing room above the head
- For portrait lifestyle tiles in ads, a slightly wider crop is almost always better than a tighter one — viewers need to read the person's mood and context at a glance
- zoomDelta of -0.15 is a moderate zoom-out; -0.25 is a comfortable wider view; -0.35 is aggressive
- panX/panY shift the visible window; use small values (0.05-0.15) for subtle repositioning
- For sleeping/resting poses, the face can be slightly off-center but should still be clearly recognizable
- Only respond "keep" if the face is already well-framed with visible headroom and the source image would not improve the crop`

export async function reviewPlacement(
  request: PlacementReviewRequest,
): Promise<CropAdjustment> {
  const apiKey = process.env.ITERATOR_GEMINI_API_KEY || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return fallback('No Gemini API key configured for placement review')
  }

  const url = `${GEMINI_API_BASE}/${REVIEW_MODEL}:generateContent?key=${apiKey}`

  const contextNote = request.context
    ? `\nAdditional context: ${request.context}`
    : ''

  const sizeNote = `\nThe target rectangle is ${request.rectWidth}x${request.rectHeight}px. The source image is ${request.imageWidth}x${request.imageHeight}px.`

  const imageParts: Array<Record<string, unknown>> = []

  if (request.sourceImageBase64) {
    imageParts.push({
      inlineData: {
        mimeType: request.mimeType,
        data: request.sourceImageBase64,
      },
    })
  }

  imageParts.push({
    inlineData: {
      mimeType: request.mimeType,
      data: request.previewImageBase64,
    },
  })

  const sourceNote = request.sourceImageBase64
    ? '\n\nYou are seeing two images: the FIRST is the full uncropped source image (what we have to work with), and the SECOND is how it currently appears cropped inside the ad tile. Compare them to judge whether the crop is too tight.'
    : ''

  const body = {
    contents: [{
      parts: [
        { text: REVIEW_PROMPT + sizeNote + sourceNote + contextNote },
        ...imageParts,
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
      console.warn(`[placementReviewer] Gemini error ${response.status}: ${errText.substring(0, 200)}`)
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

    return parseReviewResponse(text)
  } catch (err) {
    console.warn('[placementReviewer] Request failed:', (err as Error).message)
    return fallback(`Request failed: ${(err as Error).message}`)
  }
}

function parseReviewResponse(text: string): CropAdjustment {
  try {
    const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const parsed = JSON.parse(cleaned)

    const action = parsed.action === 'adjust' ? 'adjust' : 'keep'
    const zoomDelta = clamp(Number(parsed.zoomDelta) || 0, -0.4, 0)
    const panX = clamp(Number(parsed.panX) || 0, -0.3, 0.3)
    const panY = clamp(Number(parsed.panY) || 0, -0.3, 0.3)
    const confidence = ['high', 'medium', 'low'].includes(parsed.confidence)
      ? (parsed.confidence as 'high' | 'medium' | 'low')
      : 'low'
    const reason = String(parsed.reason || 'No reason provided').substring(0, 200)

    return { action, zoomDelta, panX, panY, confidence, reason }
  } catch {
    return fallback('Failed to parse review response as JSON')
  }
}

function fallback(reason: string): CropAdjustment {
  return {
    action: 'keep',
    zoomDelta: 0,
    panX: 0,
    panY: 0,
    confidence: 'low',
    reason,
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}
