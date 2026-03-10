# Atria Discovery Recon: Strategic Analysis

*Intelligence gathered 2026-03-08. Loop Earplugs workspace (vince.buyssens@loopearplugs.com).*

---

## 1. Product Surface Map

Atria organizes inspiration into five navigational surfaces under the **Inspo** module, plus adjacent modules for execution:

| Surface | URL | Role | Default Sort |
|---|---|---|---|
| **Discovery** | `/workspace/discovery` | Raw retrieval across 25M+ ads | Recommended |
| **Top Picks** | `/workspace/collection` | Editorially curated + templated collections | N/A (collections) |
| **Following** | `/workspace/following/brands` | Brand monitoring feed (29 brands followed) | Most recent |
| **Saved Ads** | `/workspace/saved/ads` | User-organized swipe file | N/A |
| **Brand Detail** | `/workspace/brand/{id}/overview` | Deep brand analysis with AI-tagged dimensions | Most recent |

Adjacent modules: **Analytics** (connected ad accounts, Radar AI strategist), **Creation** (image ad gen, clone ads), **Assets** (video/asset management), **Brands** (brand profiles).

### Surface Roles in Discovery Workflow

```
Discovery (browse/search)
    ├── Brand Detail (deep dive on one advertiser)
    │      └── AI Research Tabs: Creatives, Hooks, Ad copy, Headlines,
    │          Landing pages, Personas, Ad angles, USPs, Desires, Emotions, Themes
    ├── Top Picks (curated starting points)
    │      ├── 6 free themed collections (Promotion/Discount, Features/Benefits, 
    │      │   Testimonial, Announcement, Comparison, Media/Press)
    │      └── Paid expert picks ($99-$150 each, ~50 ads per expert)
    ├── Following (brand monitoring)
    │      └── Per-brand: live ad count, new ads in 30d, horizontal ad row
    └── Saved Ads + Boards (organization for briefing handoff)
```

---

## 2. Complete Filter Taxonomy

### Discovery Filters (7 dropdowns + 1 sort + 1 search)

| Filter | Type | Options | Behavior |
|---|---|---|---|
| **Format** | Single-select | Image, Video, Carousel | Retrieval filter (changes result set) |
| **Video length** | Single-select | 0-15s, 15-30s, 30-60s, 60-90s, 90-120s, >120s | Retrieval filter |
| **Platform** | Single-select | Meta, TikTok | Retrieval filter |
| **Industry** | Single-select | 23 categories (see below) | Retrieval filter (AI-assigned) |
| **Status** | Single-select | Active, Inactive | Retrieval filter |
| **Language** | Single-select | 130+ languages | Retrieval filter |
| **Theme** | Single-select | 12 creative archetypes (see below) | Retrieval filter (AI-assigned) |
| **Sort** | Single-select | Recommended, Most recent, Longest running | Ranking control |
| **Search** | Text + type selector | 3 search types (see below) | Retrieval + ranking override |

### Industry Values (23)
Apparel & Accessories, Appliances, Baby/Kids & Maternity, Beauty & Personal Care, Book/Publishing, Business Services, Charity/NFP & NGO, E-Commerce, Education, Event, Financial Services, Fitness/Sports & Outdoors, Food & Beverage, Games, Government, Health & Medical, Home Improvement & Garden, Life Services, Pets, Science/Technology & Engineering, Travel & Hospitality, Vehicle & Transportation, Other.

### Theme Values (12)
Announcement, Before & After, Features/Benefits, Holiday/Festival, Media/Press, Promotion/Discount, Question, Statistics, Testimonial, UGC, Unboxing, Us vs Them.

### Search Architecture

The search bar offers three distinct field-targeted modes, exposed via dropdown after typing:

| Search Type | URL Param | What it matches | Signal quality |
|---|---|---|---|
| **Ad copy contains** | `searchType=ad_copy` | Literal text match in ad body copy | High precision, low recall for problem-language queries |
| **Brand contains** | `searchType=brand` | Brand/page name matching | Only useful for known competitors |
| **Categories contains** | `searchType=categories` | AI-assigned category tags | Semantic-ish, catches product-level clustering |

When search is active, sort defaults to `Most relevant` instead of `Recommended`. URL structure: `?q={query}&searchType={type}&sortBy={sort}`.

Search results include a **brand discovery sidebar** showing related brands with their total ad counts (e.g., "Loop 43,368 Ads").

### Brand Detail Research Tabs (requires Following)

When a brand is followed, the Brand Detail page unlocks 12 AI-tagged research dimensions:

1. **Overview** (media mix, top personas, top ad angles, top USPs)
2. **Creatives** (full ad library for the brand)
3. **Hooks**
4. **Ad copy**
5. **Headlines**
6. **Landing pages**
7. **Personas**
8. **Ad angles**
9. **USPs**
10. **Desires**
11. **Emotions**
12. **Themes**

Time filters: All time, 7d, 30d, 90d, 180d, Custom.

### Ad Card Metadata (per card in grid)

- Brand name + avatar (links to brand detail)
- Date range (started_at - ended_at or "Present")
- Ad copy / hook text (truncated)
- Creative media (image thumbnail or video with duration overlay)
- Landing page domain + headline + CTA text
- Action buttons: Clone ad (images) or Scripts (videos)
- Save/bookmark icon
- More options (...)

---

## 3. Inferred Ranking Model

### Evidence Classification

**Observed** (directly visible in UI):
- Default Discovery sort is "Recommended" (not recency or longevity)
- Search results sort to "Most relevant"
- Brand Detail defaults to "Most recent"
- Following feed shows most recent activity per brand
- Three explicit sort modes: Recommended, Most recent, Longest running

**Strong inference** (consistent with multiple signals):
- **"Recommended" is a composite score**, not a simple metric. Evidence: the default Discovery feed shows a cross-industry mix of DTC brands (Nurecover, Jimmy Joy, Brooklinen, Fabletics, etc.) that are NOT from the same category and NOT sorted by date or longevity. This implies a blended signal.
- **The composite likely weights**: (a) recency/freshness of the ad, (b) brand testing velocity (how many ads the brand is running), (c) ad longevity if still active, (d) possibly editorial/curation signals. The brands in the default feed are all high-velocity DTC advertisers with hundreds to thousands of active ads.
- **Industry and Theme are AI-assigned classifications.** The 23 industry categories and 12 theme values are too systematic and comprehensive to be manual. They're applied at the ad or brand level by an automated classifier (likely LLM-based given their semantic nature).
- **Categories search uses a separate taxonomy from Industry/Theme.** The `searchType=categories` mode returned earplug-specific brands (Loop, Alpine, Flare Audio, Eargasm) that don't share an Industry value. This suggests a more granular product-category classification system underneath the 23 broad industries.
- **The brand sidebar in search results is computed from category co-occurrence**, not from the search query itself. Searching "earplugs" in categories returns Zound, Bollsen UK, Loop, klar earplugs, Happy Ears, Moto Earplugs. These are all earplug brands, suggesting Atria maintains a product-level category graph.

**Open questions**:
- Whether "Recommended" incorporates any personalization from the workspace's followed brands or saved ads history.
- Whether Atria deduplicates creative variants (same visual asset across multiple ad IDs).
- Whether the composite score factors in community engagement (saves, clicks within Atria).
- The exact relationship between "Most relevant" search ranking and text match quality vs. longevity/velocity.

### The Three-Layer Model

```
Layer 1: RETRIEVAL (what enters the candidate set)
├── Platform (Meta/TikTok)
├── Industry (23 AI-assigned categories)
├── Categories (finer-grained product taxonomy)
├── Status (Active/Inactive)
├── Language
├── Format (Image/Video/Carousel)
├── Video length
└── Text search (ad copy / brand name / category match)

Layer 2: RANKING (how candidates are ordered)
├── Recommended = composite(freshness, brand_velocity, longevity_if_active, ?editorial)
├── Most relevant = text_relevance_score (for search contexts)
├── Most recent = started_at DESC
└── Longest running = days_running DESC

Layer 3: ENRICHMENT (what aids interpretation but doesn't filter)
├── Theme (12 creative archetypes)
├── Brand sidebar (related brands by category)
├── AI research tabs (hooks, personas, angles, USPs, desires, emotions)
├── Landing page domain + CTA
├── Creative type badges (Clone ad / Scripts)
└── Date range display
```

---

## 4. How Atria Compresses the Ad Universe

Atria's core compression strategy operates in three stages:

### Stage 1: Category Pre-filtering
Before a user touches anything, Atria has already classified every ad by Industry, Theme, Language, and product Category using automated classifiers. This means the 25M+ ads are pre-indexed into navigable buckets. The user doesn't confront the full universe; they confront the intersection of their chosen filters.

### Stage 2: Composite Ranking
Within any filter combination, the "Recommended" sort surfaces a curated-feeling cross-industry feed. This is NOT random. The brands that appear (Nurecover, Jimmy Joy, Brooklinen, Fabletics, Shapellx, etc.) are consistently high-velocity DTC advertisers. This suggests Atria's recommendation algorithm rewards:
- **Active ad volume** (brands running hundreds of ads score higher)
- **Recency** (recently launched ads appear first)
- **Longevity as a tiebreaker** (ads still running after weeks/months are weighted)
- **Possibly editorial signals** (staff curation or community saves)

### Stage 3: User-Driven Narrowing
The user then narrows via filters, search, or brand following. The key insight: Atria expects users to navigate from broad browsing to specific brand deep-dives. The workflow is:

```
Browse Discovery (inspiration) → Find interesting brand → Follow brand →
    Brand Detail unlocks AI research (hooks, personas, angles, etc.) →
        Save specific ads to boards → Clone/Script for execution
```

### What Atria Does NOT Do
- No semantic/embedding search. Search is literal text matching against structured fields.
- No need-state navigation. There is no "sleep" or "focus" or "festivals" entry point.
- No cross-brand pattern detection. You can see patterns within one brand (via AI tabs) but not across brands.
- No problem-language clustering. Searching "sensory overload" works only because Loop literally uses that phrase in ad copy, not because Atria understands the problem space.
- No performance data in Discovery. No spend estimates, no impression data, no engagement metrics visible on cards. Longevity is the only survivorship proxy.

---

## 5. Need-State Search Results (Loop-Relevant Queries)

### "sleep earplugs" (ad_copy)
- **Top brands**: Loop, Manta Sleep, Happy Ears Earplugs
- **Brand sidebar**: OURA, Manta Sleep, Rise Science, Sutera Sleep, Emma, Calm, Derila
- **Insight**: Returns Loop's own ads + sleep-adjacent brands. High noise from sleep brands that aren't earplug competitors.

### "sensory overload" (ad_copy)
- **Top brands**: Loop, Flewd Stresscare, Pulse of Potential, Steady Mind, Hears, ARK Therapeutic
- **Brand sidebar**: Sensory Scout, Young Wild & Friedman, My Sensory Space Australia, JettProof
- **Insight**: Excellent cross-industry discovery. Surfaces brands serving the neurodivergent/sensory community that are NOT earplug competitors but share audience. Loop ads surface because they use this language.

### "earplugs" (categories)
- **Top brands**: Loop, Alpine Hearing Protection, Flare Audio, Eargasm, Artevive
- **Brand sidebar**: Zound, Bollsen UK, Loop (43,368 ads), klar earplugs, Happy Ears, Moto Earplugs
- **Insight**: Category search is the most precise for product-level competitor discovery. Returns actual earplug brands.

### Key Observation
Atria's search is optimized for competitor research ("show me brands that sell X") and ad copy text matching ("show me ads that mention Y"). It is NOT optimized for need-state discovery ("show me ads that solve the problem of noise sensitivity"). Loop's use case of finding cross-industry format inspiration requires the user to manually translate need states into search queries and then visually browse results.

---

## 6. What This Means for Mimir

### Atria's Model vs. Loop's Actual Use Case

Atria is architected for **competitor intelligence**: follow brands, analyze their creative strategies, clone their formats. The discovery flow assumes the user knows which brands or categories to watch.

Loop's creative strategy team uses Atria differently: they want **format inspiration regardless of industry**, filtered by whether the creative approach might work for Loop's need states. This is a fundamentally different navigation model:

| Dimension | Atria's Model | Loop's Need |
|---|---|---|
| Entry point | Brand or category | Need state or problem |
| Primary filter | Industry, Platform | Sleep, Focus, Festivals, Sensory, Parenting |
| Secondary filter | Theme, Format | Creative archetype, Proof type, Audience |
| Ranking signal | Freshness + brand velocity | Longevity + creative quality + need-state fit |
| Output | Ad gallery to browse | Brief-ready inspiration set |
| Success metric | "Found a competitor ad to reference" | "Found 3-5 formats to adapt for Loop" |

### Recommended Mimir Filter Taxonomy

Based on Atria's strengths and gaps, Mimir should adopt a **need-state-first** navigation model:

#### Primary Filters (first narrowing pass)
1. **Need State**: Sleep, Focus/Productivity, Sensory Overload/Neurodivergence, Festivals/Live Events, Parenting/Baby, Travel, Wellness/Mental Health
2. **Performance Proxy**: Longest running (>90d), Long running (30-90d), Emerging (7-30d), New tests (<7d)
3. **Status**: Active only, All

#### Secondary Filters (exploratory narrowing)
4. **Creative Style**: UGC talking head, Professional studio, Motion graphics, Lo-fi authentic, Editorial, Product showcase, Lifestyle, Meme native
5. **Proof Type**: Testimonial, Statistic, Expert endorsement, Before/after visual, Social proof numbers, Press mention, Demo evidence, None
6. **Format**: Image, Video, Carousel
7. **Video Length**: 0-15s, 15-30s, 30-60s, 60-90s, 90-120s, >120s
8. **Theme**: Announcement, Before & After, Features/Benefits, Holiday/Festival, Promotion/Discount, Question, Statistics, Testimonial, UGC, Us vs Them

#### Ranking Recipe

```
quality_score = (
    0.30 * survivorship_signal(days_running, is_active)
  + 0.25 * need_state_fit(ad_embedding, need_state_vector)
  + 0.20 * creative_quality(ai_slop_risk, legibility_risk, proof_type)
  + 0.15 * format_diversity_bonus(avoid_showing_20_of_same_brand)
  + 0.10 * freshness(started_at)
)
```

The current Mimir scoring in `semanticTagger.ts` already has the right bones:

```
score = 50
  + days_running_bonus (5/12/20 for 7/30/90+ days)
  + content_style_bonus (8 for valued styles)
  - ai_slop_penalty (0.4x risk)
  - legibility_penalty (0.15x risk)
  - proof_missing_penalty (0.1x risk)
```

What's missing: **need-state fit scoring** and **diversity enforcement** (deduplication across same-brand variants).

### Where Mimir Should Diverge from Atria

1. **Need state as primary navigation, not industry.** Atria's 23 industries don't map to Loop's use cases. "Health & Medical" contains both earplugs and supplements. Mimir should lead with the 7 need states defined in `trendDiscoveryService.ts`.

2. **Cross-source synthesis.** Atria shows ads. Mimir already has ads + trend articles + Reddit social listening. The unique value is: "here's a format pattern from ads, and here's what consumers are actually saying about this need state."

3. **Semantic search, not text matching.** Atria's search is literal (`ad_copy.ilike.%query%`). Mimir should use embeddings to find ads that solve similar problems even if they don't use the exact same words. The `adCreativeMemory` module already exists for this.

4. **Brief-ready output, not infinite browsing.** Atria shows a masonry grid of hundreds of ads. Mimir should output a concise set (5-15 ads) per need state, pre-analyzed with hooks, proof types, and creative angles.

5. **Stronger quality gate.** Atria shows everything including low-quality ads. The heuristic gate in `semanticTagger.ts` (reject if no body text, no media, or inactive + short-lived) is good. Consider raising the bar: reject if `quality_score < 40` instead of current `< 35`.

### Watchlist Query Cleanup

The current watchlist seeds in `019_watchlist_and_follows.sql` have issues:

| Current Seed | Problem | Recommended Fix |
|---|---|---|
| `sleep earplugs` | Too narrow, misses "noise while sleeping", "snoring partner" | Split into: `earplugs for sleeping`, `noise blocking sleep`, `snoring solution` |
| `focus concentration` | Too generic, pulls productivity software and nootropics | Change to: `noise reduction focus`, `earplugs office`, `noise cancelling work` |
| `noise cancelling lifestyle` | Vague, pulls headphone ads | Change to: `sensory overload`, `overstimulation noise`, `noise sensitivity` |
| `best ads` | Noise. This pulls everything. | Remove entirely. Use the `Recommended` default feed instead. |

Better seed strategy: **one watchlist entry per need state**, each with 2-3 precise queries that include Loop-adjacent problem language:

```sql
('Sleep',        'use_case', 'earplugs sleep snoring',        'US', true, 'longest_running'),
('Focus',        'use_case', 'noise reduction office focus',   'US', true, 'longest_running'),
('Sensory',      'use_case', 'sensory overload earplugs',     'US', true, 'longest_running'),
('Festivals',    'use_case', 'hearing protection concert',    'US', true, 'longest_running'),
('Parenting',    'use_case', 'baby hearing protection',       'US', true, 'longest_running'),
('Travel',       'use_case', 'noise blocking travel sleep',   'US', true, 'longest_running'),
```

### Alignment with Existing Services

The `trendDiscoveryService.ts` vertical taxonomy (festivals, neurodivergent, sleep, parenting, focus, wellness) and the `socialListeningDiscoveryService.ts` topic taxonomy (hearing-protection, noise-sensitivity, sensory-overload, sleep-noise, focus-productivity, loop-brand) are already well-structured for Loop's need states. Mimir's ad discovery should use the same 6-7 need state categories as primary navigation, creating a unified experience where ads, trends, and social signals share the same conceptual buckets.

---

## 7. UI/UX Critique of Atria Discovery

### What Works
- **Filter bar is fast and non-modal.** Popover dropdowns dismiss cleanly. No friction to combine filters.
- **Card layout is information-dense without being cluttered.** Brand name, date range, ad copy preview, media, LP domain, and CTA are all visible at card level.
- **Brand sidebar in search results** is excellent for competitor discovery. Showing ad counts gives instant sizing of competitor creative velocity.
- **Clone ad / Scripts buttons** create a direct path from inspiration to execution.

### What Doesn't Work for Format Inspiration
- **No visual clustering or grouping.** All ads appear in a flat masonry grid. There's no way to see "here are 5 ads that all use the same hook pattern" or "these brands all approach the sleep problem differently."
- **Theme filter is too coarse.** 12 themes (Testimonial, UGC, Before & After, etc.) are a useful first cut but miss the nuance of hook patterns, narrative structures, and proof devices that creative strategists actually care about.
- **No cross-brand pattern view.** You can see one brand's hooks, personas, and angles in Brand Detail, but you can't ask "show me all testimonial ads across all brands that have been running 90+ days."
- **Search is text-literal.** Searching for the problem a product solves ("I can't sleep because of my partner's snoring") doesn't work. You have to know the right keyword to match against ad copy.
- **No need-state entry point.** The first thing a Loop creative strategist wants to do is "show me winning formats for our sleep audience." Atria has no concept of this.

### Assessment
Atria is optimized for **competitor research and creative velocity tracking**, not for **need-state-driven format inspiration**. It excels when the user knows which brand or product category to investigate. It struggles when the user's question is "what creative patterns work for people who are overstimulated?"

This gap is precisely the opportunity for Mimir.
