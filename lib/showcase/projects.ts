/* ------------------------------------------------------------------ */
/*  Foundations pillars                                                */
/* ------------------------------------------------------------------ */

export interface FoundationPillar {
  n: string
  label: string
  title: string
  body: string
}

export const FOUNDATION_PILLARS: FoundationPillar[] = [
  {
    n: '01',
    label: 'Navigate',
    title: 'AI is an intelligence to work with, not a tool to command.',
    body:
      "Teams develop fluency by doing — working alongside it, not reading about it. The first hour with someone already fluent is worth more than a month of documentation. This is the shift that has to happen first — before anything else is possible.",
  },
  {
    n: '02',
    label: 'Encode',
    title: 'Turn the way we work into something the system can hold.',
    body:
      'Skills capture brand voice, domain rules, taste. Individual knowledge becomes team infrastructure. What one person knew, the whole team now works from. Organisational memory, finally.',
  },
  {
    n: '03',
    label: 'Build',
    title: 'Prototype tools nobody outside the team could spec.',
    body:
      "Navigation gives the intuition. Encoding gives the process. Together they're the foundation for tools built by the people who understand the problem best — in days, not months.",
  },
]

/* ------------------------------------------------------------------ */
/*  Software for few                                                   */
/* ------------------------------------------------------------------ */

export interface SoftwareForFewRow {
  k: string
  v: string
  tag: string
  variant: 'top' | 'accent' | 'bot'
}

export const SOFTWARE_FOR_FEW_ROWS: SoftwareForFewRow[] = [
  {
    k: 'Off-the-shelf SaaS',
    v: 'Generic. Built for millions.',
    tag: 'Too broad',
    variant: 'top',
  },
  {
    k: 'Software for few',
    v: 'Specific. Built by the team that uses it.',
    tag: 'The gap',
    variant: 'accent',
  },
  {
    k: 'Dev agency',
    v: 'Custom, but too expensive for a team of ten.',
    tag: 'Too costly',
    variant: 'bot',
  },
]

/* ------------------------------------------------------------------ */
/*  Projects                                                           */
/* ------------------------------------------------------------------ */

export type ProjectStatus = 'PRODUCTION' | 'WIP'
export type ProjectStatusTag = 'prod' | 'wip'

export interface ProjectCapability {
  k: string
  v: string
}

export interface ProjectMetric {
  k: string
  v: string
}

export interface ShowcaseProject {
  id: string
  slug: string
  name: string
  num: string
  tagline: string
  subline: string
  status: ProjectStatus
  statusTag: ProjectStatusTag
  year: string
  team: string
  oneLiner: string
  description: string
  image: string
  accent: string
  repo: string
  stack: string[]
  capabilities: ProjectCapability[]
  metrics: ProjectMetric[]
}

export const PROJECTS: ShowcaseProject[] = [
  {
    id: 'vesper',
    slug: 'vesper',
    name: 'Vesper',
    num: '01',
    tagline: 'AI Image & Video Generation',
    subline: 'Replaced Krea. Built in-house.',
    status: 'PRODUCTION',
    statusTag: 'prod',
    year: '2025',
    team: 'Studio · Design · Product',
    oneLiner:
      "Internal generation platform. Multi-model, prompt-enhanced, cost-transparent — designed around the Studio team's daily flow.",
    description:
      'Through 2025, Loop ran dozens of AI campaigns with off-the-shelf tools. Vesper replaces them with software built for a team of ten, not a platform for the industry.',
    image: '/showcase/assets/vesper.png',
    accent: '#E8806B',
    repo: 'https://github.com/tensalir/Loop-Vesper',
    stack: ['Next.js', 'Supabase', 'Claude', 'Gemini', 'Replicate', 'Kling'],
    capabilities: [
      {
        k: 'Prompt enhancement',
        v: 'Claude-powered refinement, linked to the Loop product catalogue.',
      },
      {
        k: 'Multi-model generation',
        v: 'Gemini Flash Image, Veo 3.1, Seedream, Kling — one interface.',
      },
      {
        k: 'Animate still',
        v: 'Image-to-video without leaving the tab. Small fix, big flow.',
      },
      {
        k: 'PDF image extraction',
        v: 'Pulls references out of brief docs directly. No more manual copy-paste.',
      },
    ],
    metrics: [
      { k: 'Campaigns shipped', v: 'Daily' },
      { k: 'Margin vs. Krea', v: '0%' },
      { k: 'Models unified', v: '6+' },
    ],
  },
  {
    id: 'mimir',
    slug: 'mimir',
    name: 'Mímir',
    num: '02',
    tagline: 'Briefing Intelligence',
    subline: "Loop's own insights, encoded.",
    status: 'WIP',
    statusTag: 'wip',
    year: '2025',
    team: 'Creative Strategy',
    oneLiner:
      "A briefing workspace built on Loop's own intelligence first — customer reviews, strategic analyses, and first-party ad performance. External signals are the next layer.",
    description:
      "Generation is commoditizing. The compounding advantage lives in the intelligence going in — and for Loop, most of that intelligence already exists internally. Mímir brings customer voice, strategic research, and ad-level performance data into one briefing interface, then drafts structured briefs grounded in that evidence. External signals — Meta Ad Library, social listening, trend detection — layer on top of the first-party base.",
    image: '/showcase/assets/mimir.png',
    accent: '#6D4FA6',
    repo: 'https://github.com/tensalir/mimir',
    stack: ['Claude', 'Supabase', 'Meta Graph API', 'Exa', 'Perplexity'],
    capabilities: [
      {
        k: 'Strategic Insights',
        v: 'Synthesised evidence across customer reviews, buyer feedback, and the brand growth framework — cited in every brief.',
      },
      {
        k: 'Loop Ads performance',
        v: 'First-party ad experiment data with KPI facets and variant-level drill-down, feeding directly into creative briefs.',
      },
      {
        k: 'Draft brief generation',
        v: 'Three-panel composer: evidence in, eight structured sections out, Monday handoff built in.',
      },
      {
        k: 'External signals (next)',
        v: 'Meta Ads Library, Reddit social listening, and Exa trend mining — layering onto the first-party base.',
      },
    ],
    metrics: [
      { k: 'Evidence surfaces', v: '4' },
      { k: 'Grounded in', v: 'Loop data' },
      { k: 'Handoff', v: '→ Monday' },
    ],
  },
  {
    id: 'babylon',
    slug: 'babylon',
    name: 'Babylon',
    num: '03',
    tagline: 'Localization & AI Dubbing Pipeline',
    subline: 'One approval step instead of five.',
    status: 'WIP',
    statusTag: 'wip',
    year: '2025',
    team: 'Studio · UGC',
    oneLiner:
      'Transcribe, translate, dub, caption, QA. One pipeline connected to the Monday + Frontify workflow Loop already runs.',
    description:
      'The bottleneck was never translation — it was verification. Babylon cross-checks automated transcription against on-screen captions via Gemini, so proofreaders focus where human expertise actually belongs.',
    image: '/showcase/assets/babylon.png',
    accent: '#2D7A5F',
    repo: 'https://github.com/tensalir/babylon',
    stack: ['Next.js', 'Supabase', 'ElevenLabs', 'Claude', 'Gemini', 'Remotion'],
    capabilities: [
      {
        k: 'Monday + Frontify sync',
        v: 'One-click ingest from Creative Briefs. Dedup on re-sync.',
      },
      {
        k: 'Caption-verified transcription',
        v: 'Gemini visual check against on-screen captions for timecode accuracy.',
      },
      {
        k: 'Loop Localization skill',
        v: 'Brand-voice-aware translation across 30+ languages via Claude Skills.',
      },
      {
        k: 'Timeline editor',
        v: 'Drag-and-drop caption editing with Remotion-powered animated captions.',
      },
    ],
    metrics: [
      { k: 'Languages supported', v: '30+' },
      { k: 'Review steps', v: '1' },
      { k: 'Pipeline', v: 'End-to-end' },
    ],
  },
  {
    id: 'heimdall',
    slug: 'heimdall',
    name: 'Heimdall',
    num: '04',
    tagline: 'Project Management Orchestration',
    subline: "Connects the tools that won't merge.",
    status: 'PRODUCTION',
    statusTag: 'prod',
    year: '2025',
    team: 'Cross-department',
    oneLiner:
      'The orchestration layer. Bridges Monday, Figma, Frontify, HiBob — moving information between systems that will never share a database.',
    description:
      'Monday, Figma, Frontify all do their jobs. The gaps are in moving information between them. Heimdall fills those gaps with webhooks, Figma plugins, and a unified ops pipeline.',
    image: '/showcase/assets/heimdall.png',
    accent: '#5E6472',
    repo: 'https://github.com/tensalir/heimdall',
    stack: ['Next.js 16', 'Supabase', 'Vercel KV', 'Claude', 'Figma Plugin API'],
    capabilities: [
      {
        k: 'Briefing sync',
        v: 'Monday webhooks → Claude field extraction → Figma plugin creates template pages.',
      },
      {
        k: 'Iterator plugin',
        v: 'In-Figma variant generation and format derivation (9:16, 4:5, 1:1).',
      },
      {
        k: 'Feedback summariser',
        v: 'Aggregates Figma comments and stakeholder feedback across briefings.',
      },
      {
        k: 'Forecast',
        v: 'Capacity-vs-forecast dashboards with sprint assignment push.',
      },
    ],
    metrics: [
      { k: 'Integrations', v: '8+' },
      { k: 'Surfaces', v: 'Web + 2 Figma plugins' },
      { k: 'Uptime', v: 'Production' },
    ],
  },
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

export function getProjectBySlug(slug: string): ShowcaseProject | undefined {
  return PROJECTS.find((p) => p.slug === slug)
}

export function getProjectNeighbors(slug: string): {
  prev: ShowcaseProject
  next: ShowcaseProject
} | null {
  const idx = PROJECTS.findIndex((p) => p.slug === slug)
  if (idx === -1) return null
  const prev = PROJECTS[(idx - 1 + PROJECTS.length) % PROJECTS.length]
  const next = PROJECTS[(idx + 1) % PROJECTS.length]
  return { prev, next }
}

export const PROJECT_SLUGS = PROJECTS.map((p) => p.slug)
