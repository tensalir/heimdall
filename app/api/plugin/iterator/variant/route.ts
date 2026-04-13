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
import type { GenerationBrief, CopyPlan, ImageResultWithFraming } from '@/src/iterator/types'
import { reviewTilePreflight } from '@/src/iterator/gemini/tilePreflightReviewer'
import { buildCreativeContextPack, isCreativeMemoryAvailable } from '@/src/creativeMemory/store'

export const maxDuration = 300

const VariantRequestSchema = z.object({
  sourceFileKey: z.string(),
  sourceFrameId: z.string(),
  imageNodeIds: z.array(z.string()).optional(),
  briefing: z.string().optional(),
  model: z.enum(['nano-banana-pro', 'nano-banana-2']).default('nano-banana-2'),
  resolution: z.enum(['512', '1K', '2K', '4K']).default('2K'),
})

// ImageResultWithFraming is imported from types.ts

const IMAGE_PROMPTS_FALLBACK: Record<string, string> = {
  engage: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — laughing joyfully in a warm, social setting. Same intimate, candid mood. Same warm lighting. Frame from mid-chest up, showing full face, hair, and shoulders with some breathing room around the subject. The person should feel real and approachable, not posed. No text, no logos, no earplugs visible.',
  dream: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — peacefully sleeping or dozing. Same intimate, restful mood. Same soft, muted lighting. Frame from mid-chest up, showing full face, hair, and shoulders with some breathing room around the subject. The person should feel real and relaxed. No text, no logos, no earplugs visible.',
  experience: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — enjoying a concert or live music event. Same vibrant, energetic mood with pink/purple lighting. Frame from mid-chest up, showing full face, hair, and shoulders with some breathing room around the subject. The person should feel real and in-the-moment. No text, no logos, no earplugs visible.',
  default: 'Using the reference image as a style guide, create a new portrait-style photo of a different person — different gender or skin tone — in the same setting and mood. Same lighting. Frame from mid-chest up, showing full face, hair, and shoulders with some breathing room around the subject. The person should feel real and natural, not posed. No text, no logos, no product visible.',
}

type SupportedAspectRatio = GenerationBrief['aspectRatio']

const GEMINI_RATIOS: Array<{ label: SupportedAspectRatio; value: number }> = [
  { label: '1:1', value: 1 },
  { label: '4:5', value: 4 / 5 },
  { label: '5:4', value: 5 / 4 },
  { label: '3:4', value: 3 / 4 },
  { label: '4:3', value: 4 / 3 },
  { label: '2:3', value: 2 / 3 },
  { label: '3:2', value: 3 / 2 },
  { label: '9:16', value: 9 / 16 },
  { label: '16:9', value: 16 / 9 },
]

function snapToGeminiAspectRatio(width: number, height: number): SupportedAspectRatio {
  if (width <= 0 || height <= 0) return '3:4'
  const target = width / height
  let best = GEMINI_RATIOS[0]
  let bestDist = Math.abs(Math.log(target / best.value))
  for (const entry of GEMINI_RATIOS) {
    const dist = Math.abs(Math.log(target / entry.value))
    if (dist < bestDist) {
      best = entry
      bestDist = dist
    }
  }
  return best.label
}

function getPromptForImageFallback(nodeName: string): string {
  const lower = nodeName.toLowerCase()
  if (lower.includes('engage') || lower.includes('social')) return IMAGE_PROMPTS_FALLBACK.engage
  if (lower.includes('dream') || lower.includes('sleep')) return IMAGE_PROMPTS_FALLBACK.dream
  if (lower.includes('experience') || lower.includes('concert') || lower.includes('loud')) return IMAGE_PROMPTS_FALLBACK.experience
  return IMAGE_PROMPTS_FALLBACK.default
}

/**
 * Build an image generation prompt using creative memory references when available.
 * Falls back to the hardcoded product-line prompts if retrieval is unavailable.
 */
async function getPromptForImage(nodeName: string, frameName: string, briefing?: string): Promise<string> {
  if (!isCreativeMemoryAvailable()) return getPromptForImageFallback(nodeName)

  try {
    const query = [briefing ?? '', frameName, nodeName].filter(Boolean).join(' ')
    const pack = await buildCreativeContextPack(query, { maxReferences: 3 })

    if (pack.references.length === 0) return getPromptForImageFallback(nodeName)

    const topRef = pack.references[0]
    const fp = topRef.fingerprint

    const promptParts: string[] = [
      'Using the reference image as a style guide, create a new variation.',
    ]

    if (fp.storySubject) {
      promptParts.push(`The subject should be similar in role to: ${fp.storySubject}, but a different person with different gender or skin tone.`)
    }

    promptParts.push(`Composition style: ${fp.compositionArchetype}. Background: ${fp.backgroundTreatment}. Mood: ${fp.paletteMood}.`)

    if (fp.protectedRegions.length > 0) {
      promptParts.push(`Preserve clear space in: ${fp.protectedRegions.join(', ')}.`)
    }

    promptParts.push('Frame from mid-chest up, showing full face, hair, and shoulders with breathing room. The person should feel real and natural, not posed. No text, no logos, no product visible.')

    if (fp.antiPatterns.length > 0) {
      promptParts.push(`Avoid: ${fp.antiPatterns.join('; ')}.`)
    }

    return promptParts.join(' ')
  } catch {
    return getPromptForImageFallback(nodeName)
  }
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

    // Step 4: Generate images and copy in parallel
    // Copy planning starts immediately alongside image generation to reduce total time
    const copyPromise = planCopy({
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
    }).catch((err) => {
      console.warn('[variant] Copy planning failed:', (err as Error).message)
      return null as CopyPlan | null
    })

    // Generate replacement images via Nano Banana (sequentially to avoid rate limits)
    // then run backend preflight framing review on each successful tile
    const imageResults: ImageResultWithFraming[] = []
    const jobId = `variant-${Date.now()}`

    for (const nodeId of targetImageIds) {
      const refUrl = exportedUrls[nodeId]
      if (!refUrl) {
        imageResults.push({ nodeId, url: null, error: 'Could not export original image', framing: null, rectWidth: 0, rectHeight: 0 })
        continue
      }

      const childNode = frameData.children.find((c) => c.id === nodeId)
      const nodeName = childNode?.name || ''
      const prompt = await getPromptForImage(nodeName, frameData.name, briefing)

      const rectWidth = childNode?.width || 0
      const rectHeight = childNode?.height || 0

      const aspectRatio = childNode
        ? snapToGeminiAspectRatio(rectWidth, rectHeight)
        : '3:4' as SupportedAspectRatio

      const brief: GenerationBrief = {
        prompt,
        referenceImageUrls: [refUrl],
        aspectRatio,
        resolution: resolution as '512' | '1K' | '2K' | '4K',
      }

      const result = await generateImage(brief, model)

      if (result.imageBase64) {
        // Run preflight framing review before storing
        let framing = null
        if (rectWidth > 0 && rectHeight > 0) {
          try {
            framing = await reviewTilePreflight({
              sourceImageBase64: result.imageBase64,
              mimeType: result.mimeType || 'image/png',
              rectWidth,
              rectHeight,
            })
            console.log(`[variant] Preflight for ${nodeName}: ${framing.action} (${framing.confidence}) — ${framing.reason}`)
          } catch (err) {
            console.warn(`[variant] Preflight review failed for ${nodeName}:`, (err as Error).message)
          }
        }

        const storedUrl = await storeBase64Asset(jobId, `img-${nodeId.replace(':', '-')}`, result.imageBase64)
        if (storedUrl) {
          imageResults.push({ nodeId, url: storedUrl, error: null, framing, rectWidth, rectHeight })
        } else {
          imageResults.push({ nodeId, url: null, error: 'Image generated but storage failed', framing: null, rectWidth, rectHeight })
        }
      } else {
        imageResults.push({ nodeId, url: null, error: result.error || 'Generation failed', framing: null, rectWidth, rectHeight })
      }
    }

    // Wait for copy planning to finish (started in parallel above)
    const copyPlan = await copyPromise

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
