import { Exa } from 'exa-js'
import Anthropic from '@anthropic-ai/sdk'
import { getSupabase } from '../../lib/supabase.js'

// ── Topic Taxonomy ───────────────────────────────────────────────

export interface ListeningTopic {
  id: string
  label: string
  description: string
  queries: string[]
  synthesisPrompt: string
}

export const TOPICS: ListeningTopic[] = [
  {
    id: 'hearing-protection',
    label: 'Hearing Protection',
    description: 'Earplugs, earmuffs, concert hearing safety, tinnitus prevention',
    queries: [
      'site:reddit.com earplugs hearing protection concert festival',
      'site:reddit.com best earplugs for live music hearing damage',
      'site:reddit.com tinnitus prevention ear protection recommendations',
      'site:reddit.com hearing protection daily life noise',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations about hearing protection, earplug recommendations, and tinnitus prevention from the past few weeks. Focus on real consumer language, common frustrations, product comparisons, and what people wish existed. Highlight any mentions of Loop or competing brands.',
  },
  {
    id: 'noise-sensitivity',
    label: 'Noise Sensitivity & Oversensitivity',
    description: 'Hyperacusis, misophonia, noise-induced anxiety, sound sensitivity',
    queries: [
      'site:reddit.com noise sensitivity hyperacusis coping strategies',
      'site:reddit.com misophonia living with sound sensitivity',
      'site:reddit.com oversensitive to noise daily life help',
      'site:reddit.com sound sensitivity getting worse anxiety',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations about noise sensitivity, hyperacusis, misophonia, and sound oversensitivity from the past few weeks. Focus on personal experiences, emotional language, coping strategies people share, and product solutions discussed.',
  },
  {
    id: 'sensory-overload',
    label: 'Sensory Overload & Neurodivergence',
    description: 'Autism sensory processing, ADHD overstimulation, neurodivergent noise coping',
    queries: [
      'site:reddit.com autism sensory overload noise earplugs',
      'site:reddit.com ADHD overstimulation noise reduction help',
      'site:reddit.com neurodivergent coping with loud environments',
      'site:reddit.com sensory processing disorder noise management',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations about sensory overload, neurodivergent noise coping, and overstimulation from the past few weeks. Focus on relatable struggles, coping hacks people share, product recommendations, and authentic emotional language.',
  },
  {
    id: 'sleep-noise',
    label: 'Sleep & Noise',
    description: 'Snoring partners, noisy neighbors, shift work sleep, noise blocking for rest',
    queries: [
      'site:reddit.com earplugs for sleeping snoring partner',
      'site:reddit.com noisy neighbors can\'t sleep solutions',
      'site:reddit.com best earplugs for sleeping recommendations',
      'site:reddit.com shift worker sleep noise blocking',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations about sleep and noise problems from the past few weeks. Cover partner snoring frustrations, noisy neighbor situations, earplug comfort for sleep, and what solutions people are trying or recommending.',
  },
  {
    id: 'focus-productivity',
    label: 'Focus & Productivity',
    description: 'Open office noise, coworking distractions, studying, deep work noise management',
    queries: [
      'site:reddit.com earplugs for focus open office noise',
      'site:reddit.com studying concentration noise reduction',
      'site:reddit.com coworking space too loud solutions',
      'site:reddit.com deep work noise management earplugs vs headphones',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations about noise and focus/productivity from the past few weeks. Cover open office complaints, study environment discussions, earplug vs headphone debates, and what people say actually works for concentration.',
  },
  {
    id: 'loop-brand',
    label: 'Loop Mentions',
    description: 'Direct Loop earplug discussions, reviews, comparisons, brand perception',
    queries: [
      'site:reddit.com Loop earplugs review experience',
      'site:reddit.com Loop earplugs vs other earplugs comparison',
      'site:reddit.com Loop earbuds noise reduction opinions',
      'site:reddit.com "Loop" earplugs worth it',
    ],
    synthesisPrompt:
      'Summarize the most important Reddit conversations that specifically mention Loop earplugs from the past few weeks. Focus on brand perception, product comparisons, satisfaction/disappointment, use cases people describe, and the exact language consumers use when talking about Loop.',
  },
]

export function getTopic(id: string): ListeningTopic | undefined {
  return TOPICS.find((t) => t.id === id)
}

// ── Exa Reddit Discovery ─────────────────────────────────────────

export interface RedditPost {
  exaId: string
  title: string
  url: string
  publishedDate: string | null
  author: string | null
  subreddit: string | null
  highlights: string[]
  text: string
}

function getExaClient(): Exa | null {
  const key = process.env.EXA_API_KEY
  if (!key) return null
  return new Exa(key)
}

function weeksAgoISO(weeks: number): string {
  const d = new Date()
  d.setDate(d.getDate() - weeks * 7)
  return d.toISOString().split('T')[0]
}

function extractSubreddit(url: string): string | null {
  const match = url.match(/reddit\.com\/r\/([^/]+)/)
  return match ? match[1] : null
}

function isRedditUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.replace('www.', '')
    return host === 'reddit.com' || host.endsWith('.reddit.com')
  } catch {
    return false
  }
}

export async function discoverTopic(
  topicId: string,
  sinceWeeks = 4,
): Promise<RedditPost[]> {
  const exa = getExaClient()
  if (!exa) throw new Error('EXA_API_KEY not configured')

  const topic = getTopic(topicId)
  if (!topic) throw new Error(`Unknown topic: ${topicId}`)

  const allPosts: RedditPost[] = []
  const seenUrls = new Set<string>()

  for (const query of topic.queries) {
    try {
      const result = await exa.searchAndContents(query, {
        type: 'auto',
        numResults: 8,
        startPublishedDate: weeksAgoISO(sinceWeeks),
        text: { maxCharacters: 3000 },
        highlights: { numSentences: 5 },
      })

      for (const r of result.results) {
        if (!isRedditUrl(r.url)) continue

        const normalizedUrl = r.url.split('?')[0].replace(/\/$/, '')
        if (seenUrls.has(normalizedUrl)) continue
        seenUrls.add(normalizedUrl)

        allPosts.push({
          exaId: normalizedUrl,
          title: r.title ?? 'Untitled',
          url: normalizedUrl,
          publishedDate: r.publishedDate ?? null,
          author: r.author ?? null,
          subreddit: extractSubreddit(normalizedUrl),
          highlights: r.highlights ?? [],
          text: r.text ?? '',
        })
      }
    } catch (err) {
      console.error(`[SocialListening] Exa query failed for "${query}":`, err)
    }
  }

  return allPosts
}

// ── Anthropic Authenticity Scoring ───────────────────────────────

interface ScoredPost extends RedditPost {
  relevanceScore: number
  authenticityScore: number
  creativeAngles: string[]
  languageHooks: string[]
}

const SCORING_SYSTEM_PROMPT = `You are a social listening analyst for Loop, a brand that makes stylish earplugs, earmuffs, and hearing protection products. Your audience includes festival-goers, neurodivergent people, parents, people with sleep issues, and professionals seeking focus.

You evaluate Reddit posts and comments for their potential value as consumer insight signals. High-value posts contain:
- AUTHENTIC first-person experiences (not promotional content or SEO articles)
- SPECIFIC problems, frustrations, or desires related to hearing protection / noise sensitivity
- EMOTIONAL language that reveals consumer psychology (pain points, relief, aspirations)
- ACTIONABLE hooks that a creative strategist could use for ad concepts

You REJECT:
- Promotional posts / brand astroturfing
- Generic "top 10 earplugs" listicle-style content
- Posts that are too vague or off-topic
- Low-engagement or bot-generated content`

function buildScoringPrompt(posts: RedditPost[]): string {
  const entries = posts
    .map(
      (p, i) =>
        `--- Post ${i + 1} ---\nTitle: ${p.title}\nSubreddit: r/${p.subreddit ?? 'unknown'}\nURL: ${p.url}\nHighlights: ${p.highlights.join(' | ')}\nContent: ${p.text.slice(0, 1200)}`,
    )
    .join('\n\n')

  return `Score these Reddit posts for Loop social listening value.

For EACH post, return a JSON object with:
- "index": the post number (1-based)
- "relevance_score": 0-100 (how relevant to Loop's hearing protection use cases)
- "authenticity_score": 0-100 (how authentic/genuine vs promotional/SEO)
- "creative_angles": array of 1-3 specific ad angle ideas this post could inspire
- "language_hooks": array of 1-3 direct quotes or paraphrases of consumer language that could power ad copy

Return a JSON array. Example:
[
  {
    "index": 1,
    "relevance_score": 82,
    "authenticity_score": 95,
    "creative_angles": [
      "Hook: 'I didn't realize how loud my office was until...' — relatable realization moment for focus workers"
    ],
    "language_hooks": [
      "I can finally think straight at work",
      "game changer for my anxiety"
    ]
  }
]

Posts to evaluate:

${entries}

Return ONLY the JSON array, no other text.`
}

export async function scoreAndStore(
  posts: RedditPost[],
  topicId: string,
): Promise<ScoredPost[]> {
  if (posts.length === 0) return []

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY not configured')

  const db = getSupabase()
  if (!db) throw new Error('Database not configured')

  const client = new Anthropic({ apiKey })
  const scored: ScoredPost[] = []

  const BATCH_SIZE = 10
  for (let i = 0; i < posts.length; i += BATCH_SIZE) {
    const batch = posts.slice(i, i + BATCH_SIZE)
    const prompt = buildScoringPrompt(batch)

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
        authenticity_score: number
        creative_angles: string[]
        language_hooks: string[]
      }[]

      for (const result of results) {
        const post = batch[result.index - 1]
        if (!post) continue

        scored.push({
          ...post,
          relevanceScore: Math.max(0, Math.min(100, Math.round(result.relevance_score))),
          authenticityScore: Math.max(0, Math.min(100, Math.round(result.authenticity_score))),
          creativeAngles: result.creative_angles ?? [],
          languageHooks: result.language_hooks ?? [],
        })
      }
    } catch (err) {
      console.error('[SocialListening] Anthropic scoring failed:', err)
      for (const post of batch) {
        scored.push({
          ...post,
          relevanceScore: 50,
          authenticityScore: 50,
          creativeAngles: [],
          languageHooks: [],
        })
      }
    }
  }

  const RELEVANCE_THRESHOLD = 40
  const AUTHENTICITY_THRESHOLD = 50
  const quality = scored.filter(
    (p) => p.relevanceScore >= RELEVANCE_THRESHOLD && p.authenticityScore >= AUTHENTICITY_THRESHOLD,
  )

  const existingCheck = await db
    .from('briefing_source_items')
    .select('external_id')
    .eq('source_type', 'social_comment')
    .in(
      'external_id',
      quality.map((p) => p.exaId),
    )

  const existingIds = new Set(
    (existingCheck.data ?? []).map((r: { external_id: string }) => r.external_id),
  )
  const newPosts = quality.filter((p) => !existingIds.has(p.exaId))

  if (newPosts.length > 0) {
    const rows = newPosts.map((p) => ({
      source_type: 'social_comment' as const,
      external_id: p.exaId,
      title: p.title,
      preview: p.highlights.join(' ') || p.text.slice(0, 300),
      body_text: p.text,
      link_url: p.url,
      platform: 'reddit',
      tags: [topicId],
      is_active: true,
      started_at: p.publishedDate,
      raw_data: {
        relevance_score: p.relevanceScore,
        authenticity_score: p.authenticityScore,
        creative_angles: p.creativeAngles,
        language_hooks: p.languageHooks,
        subreddit: p.subreddit,
        author: p.author,
        highlights: p.highlights,
        exa_id: p.exaId,
      },
    }))

    const { error } = await db.from('briefing_source_items').insert(rows)
    if (error) {
      console.error('[SocialListening] DB insert failed:', error)
    }
  }

  return quality
}

// ── Perplexity Digest Synthesis ──────────────────────────────────

interface DigestResult {
  digest: string
  citations: string[]
  generatedAt: string
}

export async function synthesizeDigest(topicId: string): Promise<DigestResult | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY
  if (!apiKey) return null

  const topic = getTopic(topicId)
  if (!topic) return null

  const db = getSupabase()
  if (!db) return null

  const { data: recentItems } = await db
    .from('briefing_source_items')
    .select('title, preview, link_url, platform, raw_data')
    .eq('source_type', 'social_comment')
    .contains('tags', [topicId])
    .order('created_at', { ascending: false })
    .limit(20)

  const contextBlock =
    recentItems && recentItems.length > 0
      ? recentItems
          .map(
            (item: { title: string; preview: string; link_url: string; platform: string; raw_data: Record<string, unknown> }) => {
              const sub = (item.raw_data?.subreddit as string) ?? ''
              return `- [r/${sub}] ${item.title}: ${item.preview?.slice(0, 250)}`
            },
          )
          .join('\n')
      : 'No recent posts available.'

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
              'You are a social listening analyst for Loop, a hearing protection brand. Generate concise, insight-rich digests from Reddit conversations for creative strategists who make performance ads. Focus on genuine consumer language, recurring frustrations, unmet needs, and emotional hooks. Always cite your sources.',
          },
          {
            role: 'user',
            content: `${topic.synthesisPrompt}\n\nHere are recently discovered Reddit conversations for context:\n${contextBlock}\n\nProvide a 2-3 paragraph social listening digest covering the most important patterns, consumer sentiments, language people use, and creative opportunities from Reddit right now. Be specific and cite Reddit threads/URLs where possible.`,
          },
        ],
      }),
    })

    if (!response.ok) {
      console.error('[SocialListening] Perplexity API error:', response.status)
      return null
    }

    const data = (await response.json()) as {
      choices: { message: { content: string } }[]
      citations?: string[]
    }

    const content = data.choices?.[0]?.message?.content ?? ''
    const citations = data.citations ?? []
    const generatedAt = new Date().toISOString()

    const digestExternalId = `social-digest-${topicId}`
    await db.from('briefing_source_items').upsert(
      {
        source_type: 'social_comment' as const,
        external_id: digestExternalId,
        title: `${topic.label} — Social Listening Digest`,
        preview: content.slice(0, 300),
        body_text: content,
        tags: [topicId, 'digest'],
        is_active: true,
        platform: 'perplexity',
        raw_data: {
          digest: content,
          citations,
          generated_at: generatedAt,
          topic_id: topicId,
        },
      },
      { onConflict: 'source_type,external_id' },
    )

    return { digest: content, citations, generatedAt }
  } catch (err) {
    console.error('[SocialListening] Perplexity synthesis failed:', err)
    return null
  }
}

// ── Orchestration ────────────────────────────────────────────────

export interface DiscoveryResult {
  topic: string
  discovered: number
  scored: number
  digest: boolean
}

export async function discoverAndProcess(
  topicId: string,
  sinceWeeks = 4,
): Promise<DiscoveryResult> {
  const posts = await discoverTopic(topicId, sinceWeeks)
  const scored = await scoreAndStore(posts, topicId)
  const digest = await synthesizeDigest(topicId)

  return {
    topic: topicId,
    discovered: posts.length,
    scored: scored.length,
    digest: digest !== null,
  }
}

export async function discoverAll(sinceWeeks = 4): Promise<DiscoveryResult[]> {
  const results: DiscoveryResult[] = []
  for (const topic of TOPICS) {
    try {
      const result = await discoverAndProcess(topic.id, sinceWeeks)
      results.push(result)
    } catch (err) {
      console.error(`[SocialListening] Failed for topic "${topic.id}":`, err)
      results.push({ topic: topic.id, discovered: 0, scored: 0, digest: false })
    }
  }
  return results
}
