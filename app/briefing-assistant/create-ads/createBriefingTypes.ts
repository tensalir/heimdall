import type { WorkingDocSections } from '@/src/domain/briefingAssistant/schema'

export type SourceType = 'meta-ad' | 'trend' | 'social-comment' | 'workflow-output' | 'manual'

export interface SourceItem {
  id: string
  type: SourceType
  title: string
  preview: string
  body_text?: string | null
  thumbnail_url?: string | null
  data: Record<string, unknown>
}

export interface GeneratedAsset {
  id: string
  prompt: string
  image_url: string | null
  status: 'generating' | 'completed' | 'failed'
  model: string
  created_at: string
}

export const SECTION_KEYS: (keyof WorkingDocSections)[] = [
  'idea',
  'why',
  'audience',
  'product',
  'visual',
  'copyInfo',
  'test',
  'variants',
]

export const SECTION_LABELS: Record<string, string> = {
  idea: 'Idea',
  why: 'Why',
  audience: 'Audience',
  product: 'Product',
  visual: 'Visual Direction',
  copyInfo: 'Copy & CTA',
  test: 'Test',
  variants: 'Variants',
}

export const SECTION_PLACEHOLDERS: Record<keyof WorkingDocSections, string> = {
  idea: "What's the creative spark?",
  why: 'Why does this matter strategically?',
  audience: 'Who are we speaking to?',
  product: 'Product context and positioning',
  visual: 'Visual direction, mood, references',
  copyInfo: 'Tone, key messages, CTAs',
  test: "What are we testing or learning?",
  variants: 'A/B angles, formats, or variant notes',
}
