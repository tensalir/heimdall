/**
 * POST /api/plugin/iterator/generate
 *
 * Executes image generation using Nano Banana (Gemini) based on generation
 * briefs produced by the analyze step. Supports model selection between
 * Nano Banana Pro and Nano Banana 2.
 *
 * Auth: machine (plugin token via X-Heimdall-Plugin-Token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { generateImage, generateBatch, getAvailableModels } from '../../../../../src/iterator/gemini/nanoBananaClient'
import { storeBase64Asset } from '../../../../../src/iterator/storage/assetStore'
import { updateJobStatus, storeGeneratedAsset } from '../../../../../src/iterator/jobs/iteratorJobs'

export const maxDuration = 120

const GenerateBriefSchema = z.object({
  prompt: z.string().min(1),
  referenceImageUrls: z.array(z.string()).default([]),
  aspectRatio: z.enum(['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9']).default('4:5'),
  resolution: z.enum(['512', '1K', '2K', '4K']).default('2K'),
  style: z.string().optional(),
})

const GenerateRequestSchema = z.object({
  jobId: z.string().optional(),
  briefs: z.array(GenerateBriefSchema).min(1),
  model: z.enum(['nano-banana-pro', 'nano-banana-2']).default('nano-banana-2'),
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

    if (jobId) {
      await updateJobStatus(jobId, 'generating')
    }

    const results = []
    for (const brief of briefs) {
      const result = await generateImage(brief, model)

      if (result.imageBase64 && jobId) {
        const url = await storeBase64Asset(jobId, `variant-${brief.aspectRatio}`, result.imageBase64)
        if (url) {
          await storeGeneratedAsset(jobId, 'flat-variant', brief.aspectRatio, url, brief.prompt, model)
        }
        results.push({
          aspectRatio: brief.aspectRatio,
          imageUrl: url,
          text: result.text,
          model: result.model,
          safetyBlocked: result.safetyBlocked,
        })
      } else if (result.imageBase64) {
        const dataUrl = `data:${result.mimeType || 'image/png'};base64,${result.imageBase64}`
        results.push({
          aspectRatio: brief.aspectRatio,
          imageUrl: dataUrl,
          text: result.text,
          model: result.model,
          safetyBlocked: result.safetyBlocked,
        })
      } else {
        results.push({
          aspectRatio: brief.aspectRatio,
          imageUrl: null,
          error: result.error,
          model: result.model,
          safetyBlocked: result.safetyBlocked,
        })
      }
    }

    const successCount = results.filter((r) => r.imageUrl).length

    if (jobId) {
      await updateJobStatus(jobId, successCount > 0 ? 'completed' : 'failed', {
        progress: { generatedCount: successCount, totalRequested: briefs.length },
        ...(successCount === 0 && { error: 'All generation attempts failed' }),
      })
    }

    return NextResponse.json({ jobId, model, results })
  } catch (err) {
    console.error('[iterator/generate] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Generation failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}

/**
 * GET /api/plugin/iterator/generate
 *
 * Returns available models and their capabilities.
 */
export async function GET() {
  return NextResponse.json({ models: getAvailableModels() })
}
