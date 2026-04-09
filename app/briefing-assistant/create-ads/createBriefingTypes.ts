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
  'formats',
  'variants',
  'note',
  'visual',
  'copyInfo',
  'test',
]

export const SECTION_LABELS: Record<string, string> = {
  idea: 'Idea',
  why: 'Why',
  audience: 'Audience',
  product: 'Product',
  formats: 'Formats',
  variants: 'Variants',
  note: 'Note',
  visual: 'Visual Direction',
  copyInfo: 'Copy Info',
  test: 'Testing',
}

export const SECTION_PLACEHOLDERS: Record<keyof WorkingDocSections, string> = {
  idea: "What's the creative spark?",
  why: 'Why does this matter strategically?',
  audience: 'ALL, or specific audience segment',
  product: 'e.g. Experience 2, Switch McLaren',
  formats: 'Select formats below',
  variants: '4',
  note: 'Pending items or special instructions',
  visual: 'Input here',
  copyInfo: 'Input here',
  test: 'Different angles and formats',
}

export const FORMAT_OPTIONS = [
  { id: 'carousel_9x16_4x5', label: 'carousel (9:16 + 4:5)' },
  { id: 'image_9x16_4x5', label: 'image (9:16 + 4:5)' },
  { id: 'video_9x16_4x5', label: 'video (9:16 + 4:5)' },
  { id: 'image_1x1', label: 'image (1:1)' },
  { id: 'video_1x1', label: 'video (1:1)' },
] as const

export interface LoopProduct {
  slug: string
  name: string
  tagline: string
  imageUrl: string
}

export const LOOP_PRODUCTS: LoopProduct[] = [
  { slug: 'switch', name: 'Loop Switch 2', tagline: 'All-day adjustable, 3 modes', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/switch-emerald.png' },
  { slug: 'dream', name: 'Loop Dream', tagline: 'Sleep, side-sleeping, snoring', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/dream-black.png' },
  { slug: 'quiet', name: 'Loop Quiet 2', tagline: 'Deep focus, travel, commutes', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/quiet-white.png' },
  { slug: 'experience', name: 'Experience 2', tagline: 'Concerts, festivals, events', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/experience-silver.png' },
  { slug: 'experience-plus', name: 'Experience 2 Plus', tagline: 'Events + extra reduction', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/experience-plus-gold.png' },
  { slug: 'engage', name: 'Engage 2', tagline: 'Socializing, parenting', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/engage-clear.png' },
  { slug: 'engage-plus', name: 'Engage 2 Plus', tagline: 'Socializing + extra reduction', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/engage-plus-clear.png' },
  { slug: 'engage-kids', name: 'Engage Kids 2', tagline: 'School, play, ages 6-12', imageUrl: 'https://www.loopearplugs.com/cdn/shop/files/engage-kids.png' },
]
