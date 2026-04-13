/**
 * Formats a CreativeContextPack into a prompt block for Iterator planners.
 *
 * The block is injected into the user message of each planner so the model
 * can reference historical patterns when making composition and style decisions.
 * Kept compact to avoid flooding the context window.
 */

import type { CreativeContextPack, CreativeContextCard } from '../../creativeMemory/types.js'

/**
 * Format the full context pack as a prompt section.
 * Returns empty string if no references are available.
 */
export function formatCreativeContextBlock(pack: CreativeContextPack | undefined): string {
  if (!pack || pack.references.length === 0) return ''

  const parts: string[] = []

  parts.push(`## Historical creative references (from Loop ad library)`)
  parts.push(pack.patternSummary)
  parts.push('')

  for (let i = 0; i < pack.references.length; i++) {
    const card = pack.references[i]
    parts.push(formatCard(card, i + 1))
  }

  parts.push('')
  parts.push(
    'Use these references for design direction — borrow composition archetypes, ' +
    'spacing patterns, proof mechanisms, and mood cues. Do not copy them verbatim. ' +
    'Adapt to the current briefing and audience.',
  )

  return parts.join('\n')
}

function formatCard(card: CreativeContextCard, index: number): string {
  const fp = card.fingerprint
  const lines: string[] = []

  lines.push(`### Reference ${index}: ${card.familyName} (${card.ratio}, ${Math.round(card.similarity * 100)}% match)`)

  const traits: string[] = []
  traits.push(`composition: ${fp.compositionArchetype}`)
  traits.push(`copy placement: ${fp.copyPlacement}`)
  traits.push(`background: ${fp.backgroundTreatment}`)
  traits.push(`product role: ${fp.productRole}`)
  if (fp.proofMechanism !== 'none') traits.push(`proof: ${fp.proofMechanism}`)
  traits.push(`density: ${fp.layoutDensity}`)
  traits.push(`mood: ${fp.paletteMood}`)

  lines.push(traits.join(' | '))

  if (fp.storySubject) {
    lines.push(`Story subject: ${fp.storySubject}`)
  }
  if (fp.protectedRegions.length > 0) {
    lines.push(`Protected regions: ${fp.protectedRegions.join(', ')}`)
  }
  if (fp.reusabilityNotes) {
    lines.push(`Reusability: ${fp.reusabilityNotes}`)
  }
  if (fp.antiPatterns.length > 0) {
    lines.push(`Avoid: ${fp.antiPatterns.join('; ')}`)
  }

  lines.push(`Summary: ${card.retrievalSummary}`)

  return lines.join('\n')
}
