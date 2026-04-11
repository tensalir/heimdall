/**
 * POST /api/plugin/iterator/generate
 *
 * Executes image generation using Nano Banana based on a generation brief
 * produced by the analyze step. Returns generated asset URLs.
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateImage } from '../../../../../src/iterator/gemini/nanoBananaClient'
import { storeBase64Asset } from '../../../../../src/iterator/storage/assetStore'
import { updateJobStatus, storeGeneratedAsset } from '../../../../../src/iterator/jobs/iteratorJobs'

export const maxDuration = 120

const GenerateRequestSchema = z.object({
  jobId: z.string(),
  briefs: z.array(z.object({
    prompt: z.string(),
    referenceImageUrls: z.array(z.string()).default([]),
    aspectRatio: z.enum(['4:5', '9:16', '1:1']),
    resolution: z.enum(['1K', '2K', '4K']).default('2K'),
    style: z.string().optional(),
  })),
  model: z.string().default('nano-banana-flash'),
})

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = GenerateRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { jobId, briefs, model } = parsed.data
    await updateJobStatus(jobId, 'generating')

    const results = []
    for (const brief of briefs) {
      const result = await generateImage(brief as Parameters<typeof generateImage>[0], model)

      if (result.imageBase64) {
        const url = await storeBase64Asset(jobId, `variant-${brief.aspectRatio}`, result.imageBase64)
        if (url) {
          await storeGeneratedAsset(jobId, 'flat-variant', brief.aspectRatio, url, brief.prompt, model)
        }
        results.push({ aspectRatio: brief.aspectRatio, imageUrl: url, text: result.text })
      } else {
        results.push({ aspectRatio: brief.aspectRatio, imageUrl: null, error: result.error })
      }
    }

    await updateJobStatus(jobId, 'completed', {
      progress: { generatedCount: results.filter(r => r.imageUrl).length },
    })

    return NextResponse.json({ jobId, results })
  } catch (err) {
    console.error('[iterator/generate] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Generation failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
