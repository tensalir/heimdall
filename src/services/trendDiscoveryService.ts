import { Exa } from 'exa-js'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '../../lib/supabase.js'

// ── Vertical Taxonomy ────────────────────────────────────────────

export interface Vertical {
  id: string
  label: string
  description: string
  queries: string[]
  synthesisPrompt: string
}

export const VERTICALS: Vertical[] = [
  {
    id: 'festivals',
    label: 'Festivals & Live Events',
    description: 'Music festivals, concerts, sporting events, crowd noise, hearing protection at events',
    queries: [
      'hearing protection at music festivals tips and experiences',
      'festival safety noise levels concert ear damage',
      'best practices for enjoying live events without hearing loss',
      'outdoor festival season preparation hearing safety',
    ],
    synthesisPrompt:
      'Summarize the latest trends around hearing protection, noise safety, and earplug use at music festivals, concerts, and live events. Focus on consumer experiences, health advice articles, and cultural shifts around hearing awareness at events.',
  },
  {
    id: 'neurodivergent',
    label: 'Neurodivergent & Sensory',
    description: 'Autism sensory overload, ADHD noise sensitivity, misophonia, sensory processing',
    queries: [
      'autism sensory overload coping strategies noise reduction',
      'ADHD noise sensitivity everyday life solutions',
      'misophonia living with sound sensitivity personal experiences',
      'sensory processing disorder noise management tips',
      'neurodivergent overstimulation public spaces',
    ],
    synthesisPrompt:
      'Summarize the latest trends around sensory overload, noise sensitivity, and overstimulation for neurodivergent communities (autism, ADHD, misophonia, SPD). Focus on personal stories, coping strategies, and product solutions people are discussing.',
  },
  {
    id: 'sleep',
    label: 'Sleep & Rest',
    description: 'Noise pollution and sleep quality, insomnia, shift workers, travel sleep, snoring',
    queries: [
      'noise pollution affecting sleep quality urban living solutions',
      'best ways to block noise while sleeping',
      'partner snoring solutions earplugs experiences',
      'shift worker sleep noise challenges',
    ],
    synthesisPrompt:
      'Summarize the latest trends around noise and sleep quality. Cover urban noise pollution, partner snoring solutions, shift worker challenges, and what consumers are saying about sleep-related noise reduction products.',
  },
  {
    id: 'parenting',
    label: 'Parenting & Baby',
    description: 'Baby hearing protection, toddler noise sensitivity, parenting with sensory challenges',
    queries: [
      'protecting baby hearing loud environments safety tips',
      'toddler noise sensitivity parenting advice solutions',
      'taking babies to events concerts hearing protection',
      'baby earmuffs ear protection product recommendations',
      'parenting sensory sensitive child overstimulation',
    ],
    synthesisPrompt:
      'Summarize the latest trends around protecting infant and toddler hearing, baby earmuffs, and parenting children with sensory sensitivities. Focus on parent perspectives, safety advice, and product discussions.',
  },
  {
    id: 'focus',
    label: 'Focus & Productivity',
    description: 'Open office noise, deep work, coworking distractions, studying with noise',
    queries: [
      'open office noise distractions productivity solutions earplugs',
      'deep work noise management strategies focus',
      'studying with background noise concentration tips students',
      'coworking space noise reduction strategies',
    ],
    synthesisPrompt:
      'Summarize the latest trends around noise, focus, and productivity. Cover open office challenges, deep work strategies, study environments, and what professionals and students are saying about noise management for concentration.',
  },
  {
    id: 'wellness',
    label: 'Wellness & Mental Health',
    description: 'Noise-induced anxiety, burnout, urban noise stress, overstimulation in daily life',
    queries: [
      'noise induced anxiety stress urban living mental health',
      'overstimulation modern life sensory overload daily coping',
      'burnout noise sensitivity workplace mental health',
      'quiet time self care noise reduction wellness trend',
    ],
    synthesisPrompt:
      'Summarize the latest trends around noise, mental health, and wellness. Cover noise-induced anxiety, urban overstimulation, the growing cultural interest in quiet and sensory wellness, and how consumers are managing noise for better mental health.',
  },
]

export function getVertical(id: string): Vertical | undefined {
  return VERTICALS.find((v) => v.id === id)
}

// ── Exa Discovery ────────────────────────────────────────────────

export interface ExaArticle {
  exaId: string
  title: string
  url: string
  publishedDate: string | null
  author: string | null
  image: string | null
  highlights: string[]
  text: string
}

function getExaClient(): Exa | null {
  const key = process.env.EXA_API_KEY
  if (!key) return null
  return new Exa(key)
}

const SEVEN_DAYS_AGO = () => {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().split('T')[0]
}

export async function discoverVertical(verticalId: string): Promise<ExaArticle[]> {
  const exa = getExaClient()
  if (!exa) throw new Error('EXA_API_KEY not configured')

  const vertical = getVertical(verticalId)
  if (!vertical) throw new Error(`Unknown vertical: ${verticalId}`)

  const allArticles: ExaArticle[] = []
  const seenUrls = new Set<string>()

  for (const query of vertical.queries) {
    try {
      const result = await exa.searchAndContents(query, {
        type: 'auto',
        numResults: 5,
        startPublishedDate: SEVEN_DAYS_AGO(),
        text: { maxCharacters: 2000 },
        highlights: { numSentences: 3 },
      })

      for (const r of result.results) {
        if (seenUrls.has(r.url)) continue
        seenUrls.add(r.url)

        allArticles.push({
          exaId: r.url,
          title: r.title ?? 'Untitled',
          url: r.url,
          publishedDate: r.publishedDate ?? null,
          author: r.author ?? null,
          image: r.image ?? null,
          highlights: r.highlights ?? [],
          text: r.text ?? '',
        })
      }
    } catch (err) {
      console.error(`[TrendDiscovery] Exa query failed for "${query}":`, err)
    }
  }

  return allArticles
}

// ── Anthropic Scoring ────────────────────────────────────────────

interface ScoredArticle extends ExaArticle {
  relevanceScore: number
  creativeAngles: string[]
}

const SCORING_SYSTEM_PROMPT = `You are a creative strategist for Loop, a brand that makes earplugs, earmuffs, and hearing protection products. Your audience includes festival-goers, neurodivergent people, parents, people with sleep issues, and professionals seeking focus.

You evaluate articles for their potential to inspire performance ad creatives. Good articles surface relatable consumer problems, authentic language, and emotional hooks that could drive ad concepts.

Score each article and extract creative angles a strategist could use for ads. Think about:
- The Life Force 8 (survival, comfort, freedom from pain/fear/danger, protection of loved ones, social approval)
- Persuasion techniques (social proof, reciprocity, scarcity, authority, liking, commitment)
- Hook potential (suspense, surprise, emotion, relatable problems)
- Consumer language (how real people talk about these problems)`

function buildBatchScoringPrompt(articles: ExaArticle[]): string {
  const articleEntries = articles
    .map(
      (a, i) =>
        `--- Article ${i + 1} ---\nTitle: ${a.title}\nURL: ${a.url}\nHighlights: ${a.highlights.join(' | ')}\nExcerpt: ${a.text.slice(0, 800)}`,
    )
    .join('\n\n')

  return `Score these articles for Loop earplug/earmuff ad creative potential.

For EACH article, return a JSON object with:
- "index": the article number (1-based)
- "relevance_score": 0-100 (how relevant to Loop's use cases)
- "creative_angles": array of 1-3 specific ad angle suggestions. Each should be actionable — include a hook idea, target audience, and persuasion angle.

Return a JSON array. Example:
[
  {
    "index": 1,
    "relevance_score": 85,
    "creative_angles": [
      "Hook: 'I thought festivals were supposed to be fun...' — relatable problem angle for festival-goers experiencing ringing ears the next day",
      "Social proof angle: feature real quotes from the article about hearing damage awareness"
    ]
  }
]

Articles to evaluate:

${articleEntries}

Return ONLY the JSON array, no other text.`
}

export async function scoreAndStore(
  articles: ExaArticle[],
  verticalId: string,
): Promise<ScoredArticle[]> {
  if (articles.length === 0) return []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const db = getSupabase()
  if (!db) throw new Error('Database not configured')

  const client = new Anthropic({ apiKey })
  const scored: ScoredArticle[] = []

  const BATCH_SIZE = 10
  for (let i = 0; i < articles.length; i += BATCH_SIZE) {
    const batch = articles.slice(i, i + BATCH_SIZE)
    const prompt = buildBatchScoringPrompt(batch)

    try {
      const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        system: SCORING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      })

      const textBlock = response.content.find((b) => b.type === 'text')
      const rawText = textBlock?.type === 'text' ? textBlock.text.trim() : '[]'

      let jsonStr = rawText
      const codeMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (codeMatch) jsonStr = codeMatch[1].trim()

      const results = JSON.parse(jsonStr) as {
        index: number
        relevance_score: number
        creative_angles: string[]
      }[]

      for (const result of results) {
        const article = batch[result.index - 1]
        if (!article) continue

        scored.push({
          ...article,
          relevanceScore: Math.max(0, Math.min(100, Math.round(result.relevance_score))),
          creativeAngles: result.creative_angles ?? [],
        })
      }
    } catch (err) {
      console.error('[TrendDiscovery] Anthropic scoring failed:', err)
      for (const article of batch) {
        scored.push({ ...article, relevanceScore: 50, creativeAngles: [] })
      }
    }
  }

  const existingCheck = await db
    .from('briefing_source_items')
    .select('external_id')
    .eq('source_type', 'trend')
    .in(
      'external_id',
      scored.map((a) => a.exaId),
    )

  const existingIds = new Set((existingCheck.data ?? []).map((r: { external_id: string }) => r.external_id))

  const newArticles = scored.filter((a) => !existingIds.has(a.exaId))

  if (newArticles.length > 0) {
    const rows = newArticles.map((a) => {
      let domain = ''
      try {
        domain = new URL(a.url).hostname.replace('www.', '')
      } catch { /* ignore */ }

      return {
        source_type: 'trend' as const,
        external_id: a.exaId,
        title: a.title,
        preview: a.highlights.join(' ') || a.text.slice(0, 300),
        body_text: a.text,
        thumbnail_url: a.image,
        link_url: a.url,
        platform: domain,
        tags: [verticalId],
        is_active: true,
        started_at: a.publishedDate,
        raw_data: {
          relevance_score: a.relevanceScore,
          creative_angles: a.creativeAngles,
          exa_id: a.exaId,
          highlights: a.highlights,
          author: a.author,
        },
      }
    })

    const { error } = await db.from('briefing_source_items').insert(rows)
    if (error) {
      console.error('[TrendDiscovery] DB insert failed:', error)
    }
  }

  return scored
}

// ── Perplexity Digest Synthesis ──────────────────────────────────

interface DigestResult {
  digest: string
  citations: string[]
  generatedAt: string
}

export async function synthesizeDigest(verticalId: string): Promise<DigestResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  const vertical = getVertical(verticalId)
  if (!vertical) return null

  const db = getSupabase()
  if (!db) return null

  const { data: recentItems } = await db
    .from('briefing_source_items')
    .select('title, preview, link_url, platform')
    .eq('source_type', 'trend')
    .contains('tags', [verticalId])
    .order('created_at', { ascending: false })
    .limit(15)

  const contextBlock =
    recentItems && recentItems.length > 0
      ? recentItems
          .map(
            (item: { title: string; preview: string; link_url: string; platform: string }) =>
              `- ${item.title} (${item.platform}): ${item.preview?.slice(0, 200)}`,
          )
          .join('\n')
      : 'No recent articles available.'

  try {
    const response = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar-pro',
        messages: [
          {
            role: 'system',
            content:
              'You are a trend analyst for Loop, a hearing protection brand. Generate concise, actionable trend digests for creative strategists who make performance ads. Be specific about consumer sentiments, emerging angles, and cultural moments. Always cite your sources.',
          },
          {
            role: 'user',
            content: `${vertical.synthesisPrompt}\n\nHere are some recently discovered articles for context:\n${contextBlock}\n\nProvide a 2-3 paragraph trend digest covering the most important patterns, consumer sentiments, and creative opportunities right now. Be specific and cite URLs where possible.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('[TrendDiscovery] Perplexity API error:', response.status)
      return null
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
      citations?: string[]
    }

    const content = data.choices?.[0]?.message?.content ?? ''
    const citations = data.citations ?? []
    const generatedAt = new Date().toISOString()

    const digestExternalId = `digest-${verticalId}`
    await db.from('briefing_source_items').upsert(
      {
        source_type: 'trend' as const,
        external_id: digestExternalId,
        title: `${vertical.label} — Trend Digest`,
        preview: content.slice(0, 300),
        body_text: content,
        tags: [verticalId, 'digest'],
        is_active: true,
        platform: 'perplexity',
        raw_data: {
          digest: content,
          citations,
          generated_at: generatedAt,
          vertical_id: verticalId,
        },
      },
      { onConflict: 'source_type,external_id' },
    )

    return { digest: content, citations, generatedAt }
  } catch (err) {
    console.error('[TrendDiscovery] Perplexity synthesis failed:', err)
    return null
  }
}

// ── Orchestration ────────────────────────────────────────────────

export interface DiscoveryResult {
  vertical: string
  discovered: number
  scored: number
  digest: boolean
}

export async function discoverAndProcess(verticalId: string): Promise<DiscoveryResult> {
  const articles = await discoverVertical(verticalId)
  const scored = await scoreAndStore(articles, verticalId)
  const digest = await synthesizeDigest(verticalId)

  return {
    vertical: verticalId,
    discovered: articles.length,
    scored: scored.length,
    digest: digest !== null,
  }
}

export async function discoverAll(): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = []
  for (const vertical of VERTICALS) {
    try {
      const result = await discoverAndProcess(vertical.id)
      results.push(result)
    } catch (err) {
      console.error(`[TrendDiscovery] Failed for vertical "${vertical.id}":`, err)
      results.push({ vertical: vertical.id, discovered: 0, scored: 0, digest: false })
    }
  }
  return results
}
