/**
 * POST /api/plugin/iterator/review-placement
 *
 * Lightweight endpoint that evaluates a placed image preview and returns
 * structured crop/zoom recommendations. Called by the Iterator plugin
 * after initial image placement, before the variant is finalized.
 *
 * Accepts preview image as base64 + rect/image metadata.
 * Returns a CropAdjustment with action, zoomDelta, panX, panY.
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { reviewPlacement } from '@/src/iterator/gemini/placementReviewer'
import type { PlacementReviewRequest } from '@/src/iterator/types'

export const maxDuration = 30

const ReviewRequestSchema = z.object({
  previewImageBase64: z.string(),
  sourceImageBase64: z.string().optional(),
  mimeType: z.string().default('image/png'),
  rectWidth: z.number().positive(),
  rectHeight: z.number().positive(),
  imageWidth: z.number().positive(),
  imageHeight: z.number().positive(),
  context: z.string().optional(),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = ReviewRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const reviewRequest: PlacementReviewRequest = parsed.data
    const adjustment = await reviewPlacement(reviewRequest)

    return NextResponse.json(adjustment)
  } catch (err) {
    console.error('[review-placement] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Review failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
