/**
 * Semantic V2: multimodal semantic tagging, slop detection, and quality gating.
 * Combines heuristic checks with LLM-based classification for the quality gate.
 */

export interface SemanticTags {
  content_style_tags: string[]
  hook_type: string | null
  proof_type: string | null
  creator_style: string | null
  target_market: 'b2b' | 'b2c' | null
  need_state: string | null
  ai_slop_risk: number
  legibility_risk: number
  proof_missing_risk: number
  quality_summary: string
}

export interface QualityResult {
  quality_score: number
  quality_status: 'approved' | 'rejected' | 'pending'
  quality_summary: string
  days_running: number
  duplicate_risk: number
  tags: SemanticTags
}

export const CONTENT_STYLES = [
  'testimonial_review',
  'before_after',
  'facts_stats',
  'features_benefits',
  'promotion_discount',
  'reasons_why',
  'us_vs_them',
  'media_press',
  'holiday_seasonal',
  'ugc',
  'comparison',
  'demo',
  'listicle',
  'storytelling',
] as const

export const HOOK_TYPES = [
  'question',
  'bold_claim',
  'social_proof',
  'problem_agitation',
  'curiosity_gap',
  'before_after',
  'us_vs_them',
  'statistic',
  'emotional',
  'trend_reference',
] as const

export const PROOF_TYPES = [
  'testimonial',
  'statistic',
  'expert_endorsement',
  'before_after_visual',
  'social_proof_numbers',
  'press_mention',
  'certification',
  'demo_evidence',
  'none',
] as const

export const CREATOR_STYLES = [
  'ugc_talking_head',
  'professional_studio',
  'motion_graphics',
  'lo_fi_authentic',
  'editorial',
  'meme_native',
  'product_showcase',
  'lifestyle',
] as const

export const NEED_STATES = [
  'sleep',
  'focus',
  'sensory',
  'festivals',
  'parenting',
  'travel',
  'wellness',
] as const

const NEED_STATE_DESCRIPTIONS: Record<string, string> = {
  sleep: 'Sleep & rest — noise blocking for sleep, snoring partners, noisy neighbors, shift work',
  focus: 'Focus & productivity — open office, deep work, studying, coworking noise',
  sensory: 'Sensory overload & neurodivergence — autism, ADHD, misophonia, overstimulation',
  festivals: 'Festivals & live events — concerts, music festivals, hearing protection, tinnitus prevention',
  parenting: 'Parenting & baby — infant/toddler hearing protection, sensory-sensitive children',
  travel: 'Travel — plane/train/hotel noise, commuting, travel sleep',
  wellness: 'Wellness & mental health — noise-induced anxiety, burnout, quiet self-care',
}

export interface AdForTagging {
  body_text: string | null
  page_name: string | null
  platform: string | null
  media_type: string | null
  cta_text?: string | null
  source_query?: string | null
  intended_need_state?: string | null
  is_active: boolean
  started_at: string | null
  ended_at: string | null
  thumbnail_url: string | null
  creative_url: string | null
  collation_count?: number | null
}

export function computeDaysRunning(startedAt: string | null, endedAt: string | null): number {
  if (!startedAt) return 0
  const start = new Date(startedAt)
  const end = endedAt ? new Date(endedAt) : new Date()
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 86400000))
}

export function computeHeuristicGate(ad: AdForTagging): {
  pass: boolean
  reasons: string[]
  days_running: number
} {
  const reasons: string[] = []
  const daysRunning = computeDaysRunning(ad.started_at, ad.ended_at)

  if (!ad.body_text || ad.body_text.trim().length < 10) {
    reasons.push('missing_body_text')
  }

  if (!ad.thumbnail_url && !ad.creative_url) {
    reasons.push('no_media')
  }

  if (!ad.is_active && daysRunning < 7) {
    reasons.push('inactive_short_lived')
  }

  return { pass: reasons.length === 0, reasons, days_running: daysRunning }
}

export function buildSemanticTaggingPrompt(ad: AdForTagging, daysRunning: number): string {
  const parts: string[] = []
  if (ad.page_name) parts.push(`Brand: ${ad.page_name}`)
  if (ad.platform) parts.push(`Platform: ${ad.platform}`)
  if (ad.media_type) parts.push(`Format: ${ad.media_type}`)
  if (ad.body_text) parts.push(`Ad copy:\n${ad.body_text}`)
  if (ad.cta_text) parts.push(`CTA: ${ad.cta_text}`)
  if (ad.source_query) parts.push(`Discovery seed query: ${ad.source_query}`)
  if (ad.intended_need_state) parts.push(`Intended need state: ${ad.intended_need_state}`)
  parts.push(`Active: ${ad.is_active}`)
  parts.push(`Days running: ${daysRunning}`)

  const needStateList = NEED_STATES.map((ns) => `${ns}: ${NEED_STATE_DESCRIPTIONS[ns]}`).join('\n')

  return `You are an expert performance ad creative analyst. Classify this ad.

## Ad Creative
${parts.join('\n')}

## Tasks

1. **content_style_tags**: 1-3 from: ${CONTENT_STYLES.join(', ')}
2. **hook_type**: one from: ${HOOK_TYPES.join(', ')} (or null)
3. **proof_type**: one from: ${PROOF_TYPES.join(', ')}
4. **creator_style**: one from: ${CREATOR_STYLES.join(', ')} (or null)
5. **target_market**: "b2b", "b2c", or null
6. **need_state**: Which Loop Earplugs need state does this ad's audience or problem best match? Pick one from the list below, or null if none fit.
${needStateList}
7. If the ad is clearly unrelated to the discovery seed query or intended need state, set **need_state** to null and reflect that mismatch in the summary.
8. **ai_slop_risk**: 0-100. High = generic stock feel, AI text artifacts, no real product specificity, template, nonsensical claims.
9. **legibility_risk**: 0-100. High = cluttered, too much text, unreadable, poor contrast.
10. **proof_missing_risk**: 0-100. High = claims without evidence, no testimonial/stat/demo.

Return ONLY valid JSON:
{
  "content_style_tags": ["tag1"],
  "hook_type": "type_or_null",
  "proof_type": "type",
  "creator_style": "style_or_null",
  "target_market": "b2b_or_b2c_or_null",
  "need_state": "state_or_null",
  "ai_slop_risk": 0,
  "legibility_risk": 0,
  "proof_missing_risk": 0,
  "summary": "1-2 sentence analysis"
}`
}

export function parseSemanticResponse(rawText: string): SemanticTags | null {
  try {
    let jsonStr = rawText.trim()
    const codeMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeMatch) jsonStr = codeMatch[1].trim()

    const parsed = JSON.parse(jsonStr) as Record<string, unknown>
    const clamp = (v: unknown) => {
      const n = typeof v === 'number' ? v : Number(v)
      return isNaN(n) ? 50 : Math.max(0, Math.min(100, Math.round(n)))
    }

    const rawStyles = Array.isArray(parsed.content_style_tags)
      ? (parsed.content_style_tags as string[])
      : []
    const validStyles = rawStyles.filter((s) =>
      (CONTENT_STYLES as readonly string[]).includes(s),
    )

    const rawNeedState = typeof parsed.need_state === 'string' ? parsed.need_state : null
    const validNeedState =
      rawNeedState && (NEED_STATES as readonly string[]).includes(rawNeedState)
        ? rawNeedState
        : null

    return {
      content_style_tags: validStyles.length > 0 ? validStyles : ['features_benefits'],
      hook_type: typeof parsed.hook_type === 'string' ? parsed.hook_type : null,
      proof_type: typeof parsed.proof_type === 'string' ? parsed.proof_type : 'none',
      creator_style: typeof parsed.creator_style === 'string' ? parsed.creator_style : null,
      target_market:
        parsed.target_market === 'b2b'
          ? 'b2b'
          : parsed.target_market === 'b2c'
            ? 'b2c'
            : null,
      need_state: validNeedState,
      ai_slop_risk: clamp(parsed.ai_slop_risk),
      legibility_risk: clamp(parsed.legibility_risk),
      proof_missing_risk: clamp(parsed.proof_missing_risk),
      quality_summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    }
  } catch {
    return null
  }
}

const VALUED_STYLES = new Set([
  'testimonial_review',
  'features_benefits',
  'reasons_why',
  'us_vs_them',
  'before_after',
  'facts_stats',
  'comparison',
  'demo',
])

const NEED_STATE_SEED_KEYWORDS: Record<string, string[]> = {
  sleep: ['sleep', 'snore', 'snoring', 'bedtime', 'noisy neighbor', 'nighttime'],
  focus: ['study', 'productivity', 'deep work', 'distraction', 'coworking', 'concentration', 'background noise', 'open office'],
  sensory: ['sensory', 'overstim', 'overstimulation', 'autism', 'adhd', 'misophonia', 'noise sensitivity'],
  festivals: ['concert', 'festival', 'music', 'hearing', 'hearing protection', 'tinnitus', 'live event', 'gig'],
  parenting: ['baby', 'infant', 'toddler', 'child', 'children', 'kid', 'kids', 'newborn'],
  travel: ['plane', 'flight', 'train', 'hotel', 'commute', 'jet lag', 'airplane'],
  wellness: ['anxiety', 'stress', 'burnout', 'mental health', 'self-care', 'panic'],
}

const QUERY_STOPWORDS = new Set([
  'and',
  'the',
  'for',
  'with',
  'from',
  'that',
  'this',
  'your',
  'into',
  'their',
  'them',
  'have',
  'will',
  'just',
  'been',
])

export function assessSeedRelevance(
  ad: Pick<AdForTagging, 'body_text' | 'page_name' | 'cta_text'>,
  intendedNeedState: string | null,
  sourceQuery?: string | null,
  classifiedNeedState?: string | null,
): { pass: boolean; matched_terms: string[] } {
  if (!intendedNeedState && !sourceQuery) {
    return { pass: true, matched_terms: [] }
  }

  const haystack = [
    ad.page_name ?? '',
    ad.body_text ?? '',
    ad.cta_text ?? '',
  ].join('\n').toLowerCase()

  const stateTerms = intendedNeedState
    ? (NEED_STATE_SEED_KEYWORDS[intendedNeedState] ?? []).filter((term) => haystack.includes(term))
    : []

  const queryTerms = (sourceQuery ?? '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length >= 4 && !QUERY_STOPWORDS.has(term))
    .filter((term, idx, arr) => arr.indexOf(term) === idx)
    .filter((term) => haystack.includes(term))

  const pass = intendedNeedState
    ? stateTerms.length > 0
    : queryTerms.length >= 2
  return { pass, matched_terms: [...stateTerms.slice(0, 4), ...queryTerms.slice(0, 4)] }
}

export function computeQualityScore(
  heuristic: { pass: boolean; days_running: number },
  tags: SemanticTags,
  rubricOverall?: number | null,
): { score: number; status: 'approved' | 'rejected' | 'pending' } {
  if (!heuristic.pass) {
    return { score: 0, status: 'rejected' }
  }

  let score = 50

  if (heuristic.days_running >= 90) score += 20
  else if (heuristic.days_running >= 30) score += 12
  else if (heuristic.days_running >= 7) score += 5

  if (tags.content_style_tags.some((t) => VALUED_STYLES.has(t))) score += 8

  score -= Math.round(tags.ai_slop_risk * 0.4)
  score -= Math.round(tags.legibility_risk * 0.15)
  score -= Math.round(tags.proof_missing_risk * 0.1)

  if (rubricOverall != null) {
    score = Math.round(score * 0.6 + rubricOverall * 0.4)
  }

  score = Math.max(0, Math.min(100, score))

  const status: 'approved' | 'rejected' | 'pending' =
    score >= 34 ? 'approved' : 'rejected'

  return { score, status }
}
