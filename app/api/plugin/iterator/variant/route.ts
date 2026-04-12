/**
 * POST /api/plugin/iterator/variant
 *
 * Single endpoint that orchestrates full variant generation:
 * 1. Extracts image child nodes from source frame via Figma REST
 * 2. Generates replacement images via Nano Banana with originals as style refs
 * 3. Generates new copy via paid-social skill
 * 4. Stores generated images in Supabase Storage
 * 5. Returns image URLs + copy plan for the plugin to apply
 *
 * Auth: machine (plugin token)
 */

import { NextResponse } from 'next/server'
import { z } from 'zod'
import { extractFrameData, exportChildImages } from '@/src/iterator/figma/extraction'
import { generateImage } from '@/src/iterator/gemini/nanoBananaClient'
import { planCopy } from '@/src/iterator/claude/copyPlanner'
import { storeBase64Asset } from '@/src/iterator/storage/assetStore'
import type { GenerationBrief, CopyPlan } from '@/src/iterator/types'

export const maxDuration = 120

const VariantRequestSchema = z.object({
  sourceFileKey: z.string(),
  sourceFrameId: z.string(),
  imageNodeIds: z.array(z.string()).optional(),
  briefing: z.string().optional(),
  model: z.enum(['nano-banana-pro', 'nano-banana-2']).default('nano-banana-2'),
  resolution: z.enum(['512', '1K', '2K', '4K']).default('2K'),
})

interface ImageResult {
  nodeId: string
  url: string | null
  error: string | null
}

const IMAGE_PROMPTS: Record<string, string> = {
  engage: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — laughing joyfully in a warm, social setting. Same intimate, candid mood. Same warm lighting and close crop. The person should feel real and approachable, not posed. No text, no logos, no earplugs visible.',
  dream: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — peacefully sleeping or dozing. Same intimate, restful mood. Same soft, muted lighting. Close crop on face and upper body. The person should feel real and relaxed. No text, no logos, no earplugs visible.',
  experience: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — enjoying a concert or live music event. Same vibrant, energetic mood with pink/purple lighting. Close crop. The person should feel real and in-the-moment. No text, no logos, no earplugs visible.',
  default: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — in the same setting and mood. Same lighting, same crop style. The person should feel real and natural, not posed. No text, no logos, no product visible.',
}

function getPromptForImage(nodeName: string): string {
  const lower = nodeName.toLowerCase()
  if (lower.includes('engage') || lower.includes('social')) return IMAGE_PROMPTS.engage
  if (lower.includes('dream') || lower.includes('sleep')) return IMAGE_PROMPTS.dream
  if (lower.includes('experience') || lower.includes('concert') || lower.includes('loud')) return IMAGE_PROMPTS.experience
  return IMAGE_PROMPTS.default
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const parsed = VariantRequestSchema.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      )
    }

    const { sourceFileKey, sourceFrameId, imageNodeIds, briefing, model, resolution } = parsed.data

    // Step 1: Extract frame structure
    const frameData = await extractFrameData(sourceFileKey, sourceFrameId)
    if (!frameData) {
      return NextResponse.json({ error: 'Could not extract frame data' }, { status: 404 })
    }

    // Step 2: Determine which child nodes are images to replace
    const targetImageIds = imageNodeIds || frameData.children
      .filter((c) => c.type === 'FRAME' && c.name.includes('{EDIT}'))
      .map((c) => c.id)

    if (targetImageIds.length === 0) {
      return NextResponse.json({ error: 'No image nodes found to replace' }, { status: 400 })
    }

    // Step 3: Export originals as style references
    const exportedUrls = await exportChildImages(sourceFileKey, targetImageIds)

    // Step 4: Generate replacement images via Nano Banana (sequentially to avoid rate limits)
    const imageResults: ImageResult[] = []
    const jobId = `variant-${Date.now()}`

    for (const nodeId of targetImageIds) {
      const refUrl = exportedUrls[nodeId]
      if (!refUrl) {
        imageResults.push({ nodeId, url: null, error: 'Could not export original image' })
        continue
      }

      const nodeName = frameData.children.find((c) => c.id === nodeId)?.name || ''
      const prompt = getPromptForImage(nodeName)

      const brief: GenerationBrief = {
        prompt,
        referenceImageUrls: [refUrl],
        aspectRatio: '3:4',
        resolution: resolution as '512' | '1K' | '2K' | '4K',
      }

      const result = await generateImage(brief, model)

      if (result.imageBase64) {
        const storedUrl = await storeBase64Asset(jobId, `img-${nodeId.replace(':', '-')}`, result.imageBase64)
        imageResults.push({ nodeId, url: storedUrl, error: null })
      } else {
        imageResults.push({ nodeId, url: null, error: result.error || 'Generation failed' })
      }
    }

    // Step 5: Generate copy variants in parallel with image gen
    let copyPlan: CopyPlan | null = null
    try {
      copyPlan = await planCopy({
        mode: 'layered-iteration',
        sourceFrameId,
        sourceFileKey,
        briefing: briefing || `Create a variant of this ad. Keep the same theme and product but vary the copy. Original: ${frameData.name}`,
        layerData: {
          name: frameData.name,
          width: frameData.width,
          height: frameData.height,
          children: frameData.children,
        },
      })
    } catch (err) {
      console.warn('[variant] Copy planning failed:', (err as Error).message)
    }

    return NextResponse.json({
      frameData: {
        id: frameData.id,
        name: frameData.name,
        width: frameData.width,
        height: frameData.height,
      },
      imageResults,
      copyPlan,
      successCount: imageResults.filter((r) => r.url).length,
      totalImages: targetImageIds.length,
    })
  } catch (err) {
    console.error('[iterator/variant] Error:', (err as Error).message)
    return NextResponse.json(
      { error: 'Variant generation failed', message: (err as Error).message },
      { status: 500 },
    )
  }
}
