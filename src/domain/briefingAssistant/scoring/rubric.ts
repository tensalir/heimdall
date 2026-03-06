/**
 * Creative scoring rubric for performance ads.
 * Based on Loop Earplugs "Performance Creatives 101" framework.
 *
 * Dimensions:
 *   hook      — Does the creative grab attention in the first 1-3 seconds?
 *   attention — Does pacing, movement, and visual variety sustain engagement?
 *   clarity   — Is the product visible, message clear, and benefit communicated?
 *   cta       — Is there a clear next step for the viewer?
 *   overall   — Composite weighted average
 */

export const RUBRIC_VERSION = 'v1'

export interface ScoringDimension {
  key: string
  label: string
  weight: number
  criteria: string
}

export const SCORING_DIMENSIONS: ScoringDimension[] = [
  {
    key: 'hook',
    label: 'Hook',
    weight: 0.30,
    criteria: `Rate how effectively the creative grabs attention in the first 1-3 seconds. Consider:
- Visual hook: unusual camera angle, bold color, motion, surprise element
- Text hook: on-screen text that creates curiosity or asks a relatable question
- Sound hook: audio that cuts through the feed (if video)
- Is suspense, surprise, or emotion used? (each can boost watch time significantly)
- Does the hook match the funnel stage? (discovery hooks should be relatable; action hooks should drive offers)`,
  },
  {
    key: 'attention',
    label: 'Attention',
    weight: 0.25,
    criteria: `Rate how well the creative sustains attention beyond the hook. Consider:
- Pacing: fast scene changes (every 1.5-2s for video), no dead time
- Movement and transitions: zoom, pan, or cuts that maintain visual interest
- Music/audio tempo matching the energy
- Text overlays and visual guidance sustaining engagement
- Emojis or social-first design elements that feel native to the platform`,
  },
  {
    key: 'clarity',
    label: 'Clarity',
    weight: 0.25,
    criteria: `Rate how clearly the product and value proposition are communicated. Consider:
- Is the product visible and recognizable?
- Is it clear what is being sold?
- Does the ad address a real consumer problem (not vague brand messaging)?
- Is the language consumer-centric vs. jargon-heavy?
- Does the ad use persuasion techniques: social proof, reciprocity, scarcity, authority?
- Is it relatable to the target audience's everyday life?`,
  },
  {
    key: 'cta',
    label: 'CTA',
    weight: 0.20,
    criteria: `Rate the effectiveness of the call-to-action. Consider:
- Is there a clear CTA (explicit or implicit)?
- Does the CTA match the funnel stage? (discovery = learn more; action = buy now)
- Is the closing moment strong? (slogan, product shot, or benefit recap)
- Are there at least 4 distinct variants being tested? (each variant should feel meaningfully different)`,
  },
]

export const COMPOSITE_WEIGHT_MAP = Object.fromEntries(
  SCORING_DIMENSIONS.map((d) => [d.key, d.weight]),
)

export function computeOverallScore(scores: Record<string, number>): number {
  let total = 0
  let weightSum = 0
  for (const dim of SCORING_DIMENSIONS) {
    const val = scores[dim.key]
    if (val != null) {
      total += val * dim.weight
      weightSum += dim.weight
    }
  }
  return weightSum > 0 ? Math.round(total / weightSum) : 0
}

export function buildScoringPrompt(adDescription: string): string {
  const dimensionBlock = SCORING_DIMENSIONS.map(
    (d) => `### ${d.label} (weight ${(d.weight * 100).toFixed(0)}%)\n${d.criteria}`,
  ).join('\n\n')

  return `You are an expert creative strategist evaluating performance ad creatives for Loop Earplugs.

Evaluate the following ad creative against each scoring dimension below. For each dimension, assign a score from 0-100 where:
- 90-100: Exceptional, best-in-class execution
- 70-89: Strong, effective with minor improvements possible
- 50-69: Average, functional but lacks standout elements
- 30-49: Below average, significant improvements needed
- 0-29: Poor, fundamental issues

${dimensionBlock}

## Ad Creative to Evaluate
${adDescription}

## Response Format
Return ONLY valid JSON:
{
  "hook": <0-100>,
  "attention": <0-100>,
  "clarity": <0-100>,
  "cta": <0-100>,
  "summary": "<2-3 sentence analysis explaining the key strengths and weaknesses>"
}`
}
