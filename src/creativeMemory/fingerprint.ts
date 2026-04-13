/**
 * Vision-based fingerprint analysis.
 *
 * Sends an ad image to a vision model and returns a strict JSON
 * VisualFingerprint plus a retrieval-optimized summary string.
 * The summary is what gets embedded — not the raw fingerprint.
 */

import Anthropic from '@anthropic-ai/sdk'
import {
  VisualFingerprintSchema,
  type VisualFingerprint,
  type RetrievalSummary,
  type CompositionArchetype,
  type PaletteMood,
  type ProofMechanism,
  type LayoutDensity,
} from './types.js'

const client = new Anthropic()

const SYSTEM_PROMPT = `You are a senior art director analyzing performance ads for Loop Earplugs.

Your task: given an ad image, produce a strict JSON visual fingerprint and a short retrieval summary.

The fingerprint captures evergreen design directions — composition patterns, not pixel measurements.

Return ONLY valid JSON matching this exact schema:
{
  "fingerprint": {
    "compositionArchetype": one of: hero-image-overlay | split-layout | product-grid | editorial | meme-cultural | timer-ui-sim | lifestyle-scene | testimonial | comparison | product-hero | collage | other
    "copyPlacement": one of: top-overlay | bottom-overlay | center-overlay | left-column | right-column | interleaved | minimal-no-copy | other
    "backgroundTreatment": one of: solid-color | gradient | photo-full-bleed | photo-contained | ai-generated | pattern-texture | lifestyle-scene | abstract | other
    "productRole": one of: hero-dominant | supporting-visible | lifestyle-in-use | absent-implied | packshot-only | other
    "proofMechanism": one of: testimonial-quote | review-stars | statistic | expert-endorsement | social-proof | before-after | none | other
    "ctaPattern": one of: button-bottom | button-center | text-link | swipe-up | implied-no-cta | other
    "layoutDensity": one of: minimal | moderate | dense
    "paletteMood": one of: warm | cool | neutral | vibrant | muted | dark | light | mixed
    "storySubject": string describing the primary focal subject
    "protectedRegions": array of regions carrying narrative meaning
    "dominantColors": array of up to 5 CSS color values
    "antiPatterns": array of things to avoid when reusing this composition
    "reusabilityNotes": string describing what makes this design reusable
  },
  "retrievalSummary": a single paragraph (60-120 words) describing this ad in a way optimized for semantic search. Include: product, composition style, mood, proof mechanism, audience signal, and what makes it distinctive.
}`

/**
 * Analyze an ad image and return a structured fingerprint + retrieval summary.
 * Accepts either a base64-encoded image or a URL.
 */
export async function analyzeAdImage(
  imageSource: { base64: string; mediaType: string } | { url: string },
  context?: { product?: string; useCase?: string; familyName?: string },
): Promise<{ fingerprint: VisualFingerprint; retrievalSummary: RetrievalSummary }> {
  const imageContent: Anthropic.ImageBlockParam = 'url' in imageSource
    ? { type: 'image', source: { type: 'url', url: imageSource.url } }
    : {
        type: 'image',
        source: {
          type: 'base64',
          media_type: imageSource.mediaType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: imageSource.base64,
        },
      }

  const contextHint = context
    ? `\nContext: product=${context.product ?? 'unknown'}, use_case=${context.useCase ?? 'unknown'}, family=${context.familyName ?? 'unknown'}`
    : ''

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          imageContent,
          { type: 'text', text: `Analyze this performance ad and return the JSON fingerprint.${contextHint}` },
        ],
      },
    ],
  })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from vision analysis')
  }

  const raw = textBlock.text.trim()
  let jsonStr = raw
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonStr = fenceMatch[1].trim()

  const parsed = JSON.parse(jsonStr) as {
    fingerprint: unknown
    retrievalSummary: string
  }

  const fingerprint = VisualFingerprintSchema.parse(parsed.fingerprint)

  const retrievalSummary: RetrievalSummary = {
    text: typeof parsed.retrievalSummary === 'string' ? parsed.retrievalSummary : '',
    tags: {
      product: context?.product ?? null,
      useCase: context?.useCase ?? null,
      archetype: fingerprint.compositionArchetype as CompositionArchetype,
      mood: fingerprint.paletteMood as PaletteMood,
      proofType: fingerprint.proofMechanism as ProofMechanism,
      density: fingerprint.layoutDensity as LayoutDensity,
    },
  }

  return { fingerprint, retrievalSummary }
}

/**
 * Build a normalized embedding text from a retrieval summary.
 * This is the string that gets sent to Voyage for vector encoding.
 */
export function buildEmbeddingText(summary: RetrievalSummary, familyName?: string): string {
  const parts: string[] = []
  if (familyName) parts.push(familyName)
  if (summary.tags.product) parts.push(`Product: ${summary.tags.product}`)
  if (summary.tags.useCase) parts.push(`Use case: ${summary.tags.useCase}`)
  parts.push(`Style: ${summary.tags.archetype}, ${summary.tags.mood}, ${summary.tags.density} density`)
  if (summary.tags.proofType !== 'none') parts.push(`Proof: ${summary.tags.proofType}`)
  parts.push(summary.text)
  return parts.join(' | ')
}
