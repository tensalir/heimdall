/* ------------------------------------------------------------------ */
/*  Foundations pillars                                                */
/* ------------------------------------------------------------------ */

export interface FoundationPillar {
  n: string
  label: string
  title: string
  body: string
  example?: string
}

export const FOUNDATION_PILLARS: FoundationPillar[] = [
  {
    n: '01',
    label: 'Navigate',
    title: 'AI is an intelligence to work with, not a tool to command.',
    body:
      "Teams develop fluency by doing, working alongside it, not reading about it. The first hour with someone already fluent is worth more than a month of documentation. This has to happen first, before anything else is possible.",
    example:
      "Test with Claude to map Eclipse\u2019s tone of voice on Amazon listings. Work alongside it until the direction feels right.",
  },
  {
    n: '02',
    label: 'Encode',
    title: 'Turn the way we work into something the system can hold.',
    body:
      'Skills capture brand voice, domain rules, taste. Individual knowledge becomes team infrastructure. What one person knew, the whole team now works from. Organisational memory, finally.',
    example:
      'Capture what works as a reusable skill: brand voice, Amazon constraints, product-specific rules. Anyone on the team can now produce copy in that voice.',
  },
  {
    n: '03',
    label: 'Build',
    title: 'Prototype tools nobody outside the team could spec.',
    body:
      "Navigation gives the intuition. Encoding gives the process. Together they're the foundation for tools built by the people who understand the problem best, in days, not months.",
    example:
      'When demand scales across products and markets, fold the skill into Babylon so copy generation lives next to localization in one pipeline.',
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

export type WorkflowMode = 'Repair' | 'Compress' | 'Invent'

export interface ProjectScreenshot {
  src: string
  alt: string
  caption?: string
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
  screenshots?: ProjectScreenshot[]
  accent: string
  repo: string
  stack: string[]
  capabilities: ProjectCapability[]
  metrics: ProjectMetric[]
  workflowMode: WorkflowMode
  workflowBefore: string
  workflowAfter: string
  prototypeOrigin: string
  reuseSignal: string
  companyLeverage: string
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
      "Internal generation platform. Multi-model, prompt-enhanced, cost-transparent. Designed around the Studio team's daily flow.",
    description:
      'Through 2025, Loop ran dozens of AI campaigns with off-the-shelf tools. Vesper replaces them with software built for a team of ten, not a platform for the industry.',
    image: '/showcase/assets/vesper.png',
    screenshots: [
      { src: '/showcase/screenshots/vesper/Vesper-Home.png', alt: 'Vesper: home dashboard' },
      { src: '/showcase/screenshots/vesper/Vesper-Prompt.png', alt: 'Vesper: prompt enhancement' },
      { src: '/showcase/screenshots/vesper/Vesper-Brainstorm.png', alt: 'Vesper: brainstorm mode' },
      { src: '/showcase/screenshots/vesper/Vesper-Video.png', alt: 'Vesper: video generation' },
      { src: '/showcase/screenshots/vesper/Vesper-Img-2-Video.png', alt: 'Vesper: image-to-video' },
    ],
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
        v: 'Gemini Flash Image, Veo 3.1, Seedream, Kling in one interface.',
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
    workflowMode: 'Compress',
    workflowBefore:
      'Designers switched between Krea for generation, Claude for prompting, and separate tabs for image-to-video. Costs were opaque and ballooning. Model choice overwhelmed the team; they only used 2–3 of a dozen options.',
    workflowAfter:
      'One interface: prompt enhancement, generation, and image-to-video in a single flow. Only the models Studio uses. Full cost transparency per generation. Creative momentum stays unbroken.',
    prototypeOrigin:
      'Krea costs were escalating with no price transparency. The team was paying a markup on the same Google APIs we could access directly. The first prototype proved we could match the workflow in days.',
    reuseSignal:
      'The prompt enhancer (Claude enriching visual prompts with product catalogue context) became a reusable pattern now shared across Vesper, Mímir briefing drafts, and ad copy generation.',
    companyLeverage:
      'Any team generating visual content (Product, E-commerce, CRM) can use Vesper without depending on Studio. Cost transparency gives leadership real spend-per-asset data for the first time.',
  },
  {
    id: 'mimir',
    slug: 'mimir',
    name: 'Mímir',
    num: '02',
    tagline: 'Brand Intelligence',
    subline: "Loop's own knowledge, structured.",
    status: 'WIP',
    statusTag: 'wip',
    year: '2025',
    team: 'Creative Strategy · Product · Insights',
    oneLiner:
      "Brand intelligence for the whole company. Customer voice, ad performance, strategic research, and market signals in one place, usable by Creative Strategy, Product, and anyone building on Loop's own knowledge.",
    description:
      "Generation is commoditizing. The lasting advantage is in the intelligence going in, and for Loop, most of that intelligence already exists internally. Mímir makes it accessible: customer reviews, strategic research, ad performance, and audience personas in one interface. Creative Strategy uses it for briefings. Product uses it for persona development and product iteration. The same intelligence layer serves anyone who needs to think with Loop's data.",
    image: '/showcase/assets/mimir.png',
    screenshots: [
      { src: '/showcase/screenshots/mimir/Mimir-Feed.png', alt: 'Mímir: intelligence feed' },
      { src: '/showcase/screenshots/mimir/Mimir-Briefing Flow.png', alt: 'Mímir: briefing composer' },
      { src: '/showcase/screenshots/mimir/Mimir_Briefing May.png', alt: 'Mímir: May briefing output' },
      { src: '/showcase/screenshots/mimir/Mimir-Loop Ads.png', alt: 'Mímir: Loop Ads performance' },
      { src: '/showcase/screenshots/mimir/Mimir-Loop Ads-Closeup.png', alt: 'Mímir: ad detail close-up' },
      { src: '/showcase/screenshots/mimir/MImir-Customer Review.png', alt: 'Mímir: customer review insights' },
      { src: '/showcase/screenshots/mimir/Mimir-Personas.png', alt: 'Mímir: audience personas' },
    ],
    accent: '#6D4FA6',
    repo: 'https://github.com/tensalir/mimir',
    stack: ['Claude', 'Supabase', 'Meta Graph API', 'Exa', 'Perplexity'],
    capabilities: [
      {
        k: 'Customer voice',
        v: 'Synthesised evidence across customer reviews, buyer feedback, and the brand growth framework. Accessible to every team.',
      },
      {
        k: 'Ad performance intelligence',
        v: 'First-party ad experiment data with KPI facets and variant-level drill-down. Used for briefings, personas, and product decisions.',
      },
      {
        k: 'Structured brief generation',
        v: 'Three-panel composer that turns evidence into structured briefs. The same format works for creative, product, and strategy.',
      },
      {
        k: 'External signals (next)',
        v: 'Meta Ads Library, Reddit social listening, and Exa trend mining layering onto the first-party base.',
      },
    ],
    metrics: [
      { k: 'Intelligence sources', v: '4+' },
      { k: 'Core uses', v: 'Briefs + personas' },
      { k: 'Scope', v: 'Company-wide' },
    ],
    workflowMode: 'Invent',
    workflowBefore:
      'Creative strategists assembled briefings manually: pulling competitor ads from Meta Ad Library, scanning Reddit, checking a separate tool for performance data, and cross-referencing customer reviews in spreadsheets. No single view of the evidence.',
    workflowAfter:
      'One interface surfaces best-performing ads, customer reviews, strategic insight themes, and competitive signals as composable building blocks. Structured briefs are drafted from evidence, not from memory.',
    prototypeOrigin:
      'Part of Project Proteus. The question was: what if we grounded every creative brief in the intelligence Loop already has internally, instead of starting from a blank page? The first version proved the concept in a week.',
    reuseSignal:
      'The insights interface (customer reviews, strategic themes, performance data in one view) is becoming a shared module. Product Marketing is already using it to build personas and position new products like Aphrodite.',
    companyLeverage:
      'Mímir is already expanding beyond Creative Strategy into Product and Insights. Any team that needs to think with Loop\'s own data (product launches, market expansion, audience development, persona work) uses the same intelligence layer.',
  },
  {
    id: 'babylon',
    slug: 'babylon',
    name: 'Babylon',
    num: '03',
    tagline: 'Copy, Localization & Dubbing Pipeline',
    subline: 'One approval step instead of five.',
    status: 'WIP',
    statusTag: 'wip',
    year: '2025',
    team: 'Studio · UGC',
    oneLiner:
      'Translate, transcribe, dub, caption, QA — for video and copy. One pipeline connected to the Monday + Frontify workflow Loop already runs.',
    description:
      'The bottleneck was never translation, it was verification. Babylon cross-checks automated transcription against on-screen captions via Gemini, so proofreaders focus where human judgment actually matters.',
    image: '/showcase/assets/babylon.png',
    screenshots: [
      { src: '/showcase/screenshots/babylon/Babylon-Overview.png', alt: 'Babylon: pipeline overview' },
      { src: '/showcase/screenshots/babylon/Babylon-Dubbing Example.png', alt: 'Babylon: dubbing example' },
      { src: '/showcase/screenshots/babylon/Babylon-Analytics.png', alt: 'Babylon: analytics dashboard' },
    ],
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
    workflowMode: 'Invent',
    workflowBefore:
      'There was no workflow. UGC localization was outsourced to agencies: slow, expensive, and disconnected from the tools the team already used. Translating Figma files required manual copy-paste across languages.',
    workflowAfter:
      'One pipeline: pull assets from Monday and Frontify, transcribe, visually verify against on-screen captions, translate with a brand-voice-aware model, dub, caption, and review. All connected to the existing approval flow.',
    prototypeOrigin:
      'The UGC team needed to localize creator content at volume for market expansion. No off-the-shelf tool handled transcription, translation, dubbing, and review in one flow. The first prototype connected Monday assets to a transcription pipeline in three days.',
    reuseSignal:
      'The review sheet, built originally for UGC proofreading, became a reusable module. It now powers Figma file translation review too. Any workflow that needs human verification of AI-generated text reuses the same component.',
    companyLeverage:
      'Copy and localization are company-wide needs. As Loop expands into new markets, Babylon scales from UGC dubbing to any content type (product copy, Figma assets, campaign materials) using the same translation and review infrastructure.',
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
      'The orchestration layer. Bridges Monday, Figma, and Frontify, moving information between systems that will never share a database.',
    description:
      'Monday, Figma, Frontify all do their jobs. The gaps are in moving information between them. Heimdall fills those gaps with webhooks, Figma plugins, and a unified ops pipeline.',
    image: '/showcase/assets/heimdall.png',
    screenshots: [
      { src: '/showcase/screenshots/heimdall/Heimdall-Briefing Overview.png', alt: 'Heimdall: briefing overview' },
      { src: '/showcase/screenshots/heimdall/Heimdall-Briefing Closeup.png', alt: 'Heimdall: briefing detail' },
      { src: '/showcase/screenshots/heimdall/Heimdall-Figma Template.png', alt: 'Heimdall: Figma template sync' },
      { src: '/showcase/screenshots/heimdall/Heimdall-Figma Plugin.png', alt: 'Heimdall: Figma plugin' },
      { src: '/showcase/screenshots/heimdall/Heimdall-Feedback Summarizer.png', alt: 'Heimdall: feedback summariser' },
    ],
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
    workflowMode: 'Repair',
    workflowBefore:
      'Project managers briefed campaigns in Monday, then manually recreated each briefing inside Figma. Feedback lived in Figma comments, Monday updates, and Excel sheets, never in one place. Creative strategists toggled between tools to piece together what stakeholders actually said.',
    workflowAfter:
      'Monday webhooks trigger automatic briefing creation in Figma via a plugin. Feedback from Figma and Monday is summarised into a single sheet. The tools stay the same; the gaps between them disappear.',
    prototypeOrigin:
      'Watching project managers copy the same briefing fields from Monday into Figma, every single day. Monday and Figma are stakeholder management tools too. You can\'t replace them, but you can eliminate the manual transfer between them.',
    reuseSignal:
      'The feedback summariser module (aggregating comments across tools into one view) is reusable for any workflow where stakeholder input is scattered. The Figma plugin architecture powers both briefing sync and the Iterator variant tool.',
    companyLeverage:
      'Heimdall is the connective tissue. Any department running on Monday + Figma + Frontify benefits from automated handoffs. The orchestration layer scales from Paid Social production to any team that moves structured information between systems.',
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

/* ------------------------------------------------------------------ */
/*  Next steps: executive end-state section                           */
/* ------------------------------------------------------------------ */

export interface NextStepRole {
  label: string
  title: string
  body: string
}

export const NEXT_STEP_ROLES: NextStepRole[] = [
  {
    label: 'Creative Technologists',
    title: 'Navigate, encode, build. Inside each team.',
    body:
      'One central hub coordinates the flywheel. Creative Technologists sit inside different teams, connected to each other, improving workflows from the inside out. What started in Marketing expands to the teams that need it.',
  },
  {
    label: 'AI + Data Engineers',
    title: 'Prepare the context everything else runs on.',
    body:
      'Clean, reliable internal data powers Mímir, Claude Skills, and every tool that follows. Data engineers from the AI and data team ensure that whether insights flow through a briefing agent or a Claude Skill, they start from a trusted source.',
  },
  {
    label: 'Full-Stack Engineering',
    title: 'Harden prototypes. Create reusable components.',
    body:
      'Vibe-coded prototypes prove the idea. A full-stack engineer makes them safe, stable, and reusable, so the next prototype starts from components instead of from scratch.',
  },
  {
    label: 'Requirements + Coordination',
    title: 'Keep priorities coherent across teams.',
    body:
      'A people business partner gathers requirements, documents what works, and keeps the bigger picture visible so institutional knowledge stops living in one head.',
  },
]

export interface PartnerPoint {
  label: string
  body: string
}

export const PARTNER_MODEL: PartnerPoint[] = [
  {
    label: 'Internal flywheel',
    body:
      'Owns navigation, encoding, prototyping, and workflow judgment. Stays close to the work. Moves faster than any outside dependency. Reuses components across teams because the same person sees converging problems.',
  },
  {
    label: 'Strategic partner: Inku',
    body:
      'Accelerates larger engineering: knowledge graphs, product placement models, cross-platform intelligence. What Inku builds at scale, Creative Technology can leverage across every internal tool and Claude Skill.',
  },
]
