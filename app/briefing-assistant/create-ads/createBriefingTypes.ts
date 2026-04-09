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
  { slug: 'switch', name: 'Loop Switch 2', tagline: 'All-day adjustable, 3 modes', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_SWITCH_EMERALD_1-371454.png?v=1729670651' },
  { slug: 'dream', name: 'Loop Dream', tagline: 'Sleep, side-sleeping, snoring', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_DREAM_LILAC_1-270685.png?v=1728593375' },
  { slug: 'quiet', name: 'Loop Quiet 2', tagline: 'Deep focus, travel, commutes', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_QUIET_WHITE_01-805740.png?v=1725976815' },
  { slug: 'experience', name: 'Experience 2', tagline: 'Concerts, festivals, events', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_EXPERIENCE2_SILVER_01.png?v=1770983744' },
  { slug: 'experience-plus', name: 'Experience 2 Plus', tagline: 'Events + extra reduction', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_EXPERIENCE2PLUS_GOLD_01-374433.png?v=1715750475' },
  { slug: 'engage', name: 'Engage 2', tagline: 'Socializing, parenting', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_ENGAGE2_CLEAR_01-917223.png?v=1715087473' },
  { slug: 'engage-plus', name: 'Engage 2 Plus', tagline: 'Socializing + extra reduction', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_ENGAGE2PLUS_CLEAR_01-244449.png?v=1715087473' },
  { slug: 'engage-kids', name: 'Engage Kids 2', tagline: 'School, play, ages 6-12', imageUrl: 'https://cdn.shopify.com/s/files/1/1442/3288/files/PDP_ENGAGE_KIDS_2_BERRY_BLUE_01.png?v=1759828353' },
]
