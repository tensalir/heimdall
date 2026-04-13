/**
 * Creative Memory — type contracts for the visual fingerprint,
 * creative-family records, retrieval summaries, and context packs.
 *
 * These types are the shared language between the ingest pipeline,
 * the vision-analysis step, the pgvector store, and the Iterator
 * planners that consume retrieved context at runtime.
 */

import { z } from 'zod'

// ---------------------------------------------------------------------------
// Canonical aspect ratios (same as Iterator)
// ---------------------------------------------------------------------------

export type CanonicalRatio = '9x16' | '4x5' | '1x1'

export const CANONICAL_RATIOS: CanonicalRatio[] = ['9x16', '4x5', '1x1']

// ---------------------------------------------------------------------------
// Creative family: one concept, multiple ratio siblings
// ---------------------------------------------------------------------------

export interface CreativeFamily {
  id: string
  /** Human-readable family name derived from naming convention */
  familyName: string
  /** Loop product this ad promotes */
  product: string | null
  /** Use-case / need-state (sleep, focus, festivals, etc.) */
  useCase: string | null
  /** Campaign or batch token from naming convention */
  campaignToken: string | null
  /** Lifecycle label — coarse, not performance-regression-derived */
  status: 'active' | 'approved' | 'evergreen' | 'retired'
  /** Source Frontify folder path or ID */
  frontifyFolderId: string | null
  /** Optional Figma file key + page for provenance */
  figmaFileKey: string | null
  figmaPageId: string | null
  createdAt: string
  updatedAt: string
}

// ---------------------------------------------------------------------------
// Creative asset: one ratio variant within a family
// ---------------------------------------------------------------------------

export interface CreativeAsset {
  id: string
  familyId: string
  ratio: CanonicalRatio
  /** Frontify asset ID for the actual image file */
  frontifyAssetId: string | null
  /** Permanent download URL from Frontify */
  downloadUrl: string | null
  /** Mirrored thumbnail in Supabase Storage for fast retrieval */
  thumbnailUrl: string | null
  /** Optional Figma frame reference */
  figmaNodeId: string | null
  /** Pixel dimensions as stored */
  width: number | null
  height: number | null
  createdAt: string
}

// ---------------------------------------------------------------------------
// Visual fingerprint: strict JSON contract for evergreen design directions
// ---------------------------------------------------------------------------

export const CompositionArchetypeEnum = z.enum([
  'hero-image-overlay',
  'split-layout',
  'product-grid',
  'editorial',
  'meme-cultural',
  'timer-ui-sim',
  'lifestyle-scene',
  'testimonial',
  'comparison',
  'product-hero',
  'collage',
  'other',
])
export type CompositionArchetype = z.infer<typeof CompositionArchetypeEnum>

export const CopyPlacementEnum = z.enum([
  'top-overlay',
  'bottom-overlay',
  'center-overlay',
  'left-column',
  'right-column',
  'interleaved',
  'minimal-no-copy',
  'other',
])
export type CopyPlacement = z.infer<typeof CopyPlacementEnum>

export const BackgroundTreatmentEnum = z.enum([
  'solid-color',
  'gradient',
  'photo-full-bleed',
  'photo-contained',
  'ai-generated',
  'pattern-texture',
  'lifestyle-scene',
  'abstract',
  'other',
])
export type BackgroundTreatment = z.infer<typeof BackgroundTreatmentEnum>

export const ProductRoleEnum = z.enum([
  'hero-dominant',
  'supporting-visible',
  'lifestyle-in-use',
  'absent-implied',
  'packshot-only',
  'other',
])
export type ProductRole = z.infer<typeof ProductRoleEnum>

export const ProofMechanismEnum = z.enum([
  'testimonial-quote',
  'review-stars',
  'statistic',
  'expert-endorsement',
  'social-proof',
  'before-after',
  'none',
  'other',
])
export type ProofMechanism = z.infer<typeof ProofMechanismEnum>

export const CtaPatternEnum = z.enum([
  'button-bottom',
  'button-center',
  'text-link',
  'swipe-up',
  'implied-no-cta',
  'other',
])
export type CtaPattern = z.infer<typeof CtaPatternEnum>

export const LayoutDensityEnum = z.enum([
  'minimal',
  'moderate',
  'dense',
])
export type LayoutDensity = z.infer<typeof LayoutDensityEnum>

export const PaletteMoodEnum = z.enum([
  'warm',
  'cool',
  'neutral',
  'vibrant',
  'muted',
  'dark',
  'light',
  'mixed',
])
export type PaletteMood = z.infer<typeof PaletteMoodEnum>

export const VisualFingerprintSchema = z.object({
  compositionArchetype: CompositionArchetypeEnum,
  copyPlacement: CopyPlacementEnum,
  backgroundTreatment: BackgroundTreatmentEnum,
  productRole: ProductRoleEnum,
  proofMechanism: ProofMechanismEnum,
  ctaPattern: CtaPatternEnum,
  layoutDensity: LayoutDensityEnum,
  paletteMood: PaletteMoodEnum,

  /** Primary focal subject description (person, product, scene element) */
  storySubject: z.string(),
  /** Regions of the frame that carry narrative meaning and should not be occluded */
  protectedRegions: z.array(z.string()),
  /** Dominant + accent colors as CSS-style values */
  dominantColors: z.array(z.string()).max(5),
  /** Anti-patterns or things to avoid when reusing this composition */
  antiPatterns: z.array(z.string()),
  /** Notes on what makes this design reusable or how to adapt it */
  reusabilityNotes: z.string(),
})

export type VisualFingerprint = z.infer<typeof VisualFingerprintSchema>

// ---------------------------------------------------------------------------
// Retrieval summary: compact text optimized for embedding + reranking
// ---------------------------------------------------------------------------

export interface RetrievalSummary {
  /** One-paragraph description of the ad, written for embedding quality */
  text: string
  /** Structured tags for metadata-filtered retrieval */
  tags: {
    product: string | null
    useCase: string | null
    archetype: CompositionArchetype
    mood: PaletteMood
    proofType: ProofMechanism
    density: LayoutDensity
  }
}

// ---------------------------------------------------------------------------
// Creative context pack: what Iterator planners receive at runtime
// ---------------------------------------------------------------------------

export interface CreativeContextCard {
  familyName: string
  product: string | null
  ratio: CanonicalRatio
  fingerprint: VisualFingerprint
  retrievalSummary: string
  thumbnailUrl: string | null
  similarity: number
}

export interface CreativeContextPack {
  /** Selected reference cards, ordered by relevance */
  references: CreativeContextCard[]
  /** Aggregate pattern observations across retrieved references */
  patternSummary: string
  /** Query that produced this pack (for debugging / logging) */
  query: string
}

// ---------------------------------------------------------------------------
// Embedding record (maps to the pgvector table)
// ---------------------------------------------------------------------------

export interface CreativeEmbeddingRow {
  id: string
  family_id: string
  asset_id: string | null
  embedding_text: string
  product: string | null
  use_case: string | null
  composition_archetype: string | null
  palette_mood: string | null
  similarity: number
}

// ---------------------------------------------------------------------------
// Ingest request schemas
// ---------------------------------------------------------------------------

export const IngestFolderRequestSchema = z.object({
  frontifyFolderId: z.string(),
  product: z.string().optional(),
  useCase: z.string().optional(),
  campaignToken: z.string().optional(),
  status: z.enum(['active', 'approved', 'evergreen', 'retired']).default('approved'),
})

export type IngestFolderRequest = z.infer<typeof IngestFolderRequestSchema>
