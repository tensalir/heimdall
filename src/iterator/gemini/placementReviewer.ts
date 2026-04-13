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

const REVIEW_PROMPT = `You are an art director reviewing a portrait photo placed inside an ad frame.

The image has been placed using "cover" (FILL) mode, which means it fills the rectangle completely but crops the edges. Your job is to evaluate whether the person's face is clearly visible and well-framed, or whether the image needs to be zoomed out (showing more of the image) or panned to center the face better.

Evaluate the placed image and respond with ONLY a JSON object (no markdown, no explanation outside the JSON):

{
  "action": "keep" or "adjust",
  "zoomDelta": number between -0.4 and 0 (negative = zoom out to show more, 0 = no change),
  "panX": number between -0.3 and 0.3 (negative = pan left, positive = pan right),
  "panY": number between -0.3 and 0.3 (negative = pan up, positive = pan down),
  "confidence": "high", "medium", or "low",
  "reason": "brief explanation"
}

Guidelines:
- If the face is fully visible with forehead, chin, and both eyes clearly showing, respond with action "keep"
- If the face is cropped (forehead cut off, chin missing, only partial face visible), respond with action "adjust"
- zoomDelta of -0.15 is a moderate zoom-out; -0.3 is aggressive
- panX/panY shift the visible window; use small values (0.05-0.15) for subtle repositioning
- Be conservative: only suggest adjustments when the face is clearly too cropped
- For sleeping/resting poses, the full face doesn't need to be perfectly centered but should be recognizable`

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

  const body = {
    contents: [{
      parts: [
        { text: REVIEW_PROMPT + sizeNote + contextNote },
        {
          inlineData: {
            mimeType: request.mimeType,
            data: request.previewImageBase64,
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
