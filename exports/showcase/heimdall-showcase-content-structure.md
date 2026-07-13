# AI in Studio — Showcase Content & Structure

Purpose: LLM-friendly version of the showcase homepage for strategic brainstorming. This file preserves the page structure, core argument, proof points, and project content without HTML/CSS noise.

Source page: `/showcase`  
HTML export: `exports/showcase/heimdall-showcase-homepage.html`  
Audience: Loop leadership / strategic stakeholders  
Owner: Vince Buyssens, Creative Technology · Marketing

---

## 1. Strategic Thesis

The page argues that AI adoption becomes valuable when it turns into a repeatable company capability:

1. Teams first learn to work with AI inside the actual work.
2. That knowledge is encoded into reusable skills, systems, and workflows.
3. Those encoded workflows become internal tools built by the teams who understand the problem.

The central metaphor is a flywheel:

> Navigate → Encode → Build

The four showcased tools prove the pattern across visual generation, brand intelligence, localization, and project-management orchestration.

---

## 2. Page Structure

### Top Navigation

Brand:

> Creative Technology

Navigation anchors:

- Foundations
- Projects
- Next
- Contact

Version marker:

> v.2026.04

---

## 3. Hero / Foundations

Section label:

> Creative Technology · Loop Earplugs

Date:

> April 2026

Hero headline:

> A flywheel. Three steps.  
> They compound into how Loop builds.

Hero body:

> Two years embedded in Marketing, cultivating AI adoption from inside the work and shipping tools that make teams self-sufficient. The flywheel below is how adoption turns into encoded knowledge, and then into production-grade tools.

Lead:

> Vince Buyssens  
> Creative Technology · Marketing

Track record:

> 90% of briefings use AI  
> 6 tools in production · 140 Claude users across departments

### Foundation Pillars

#### 01 — Navigate

Title:

> AI is an intelligence to work with, not a tool to command.

Body:

> Teams develop fluency by doing, working alongside it, not reading about it. The first hour with someone already fluent is worth more than a month of documentation. This has to happen first, before anything else is possible.

Example: Eclipse × Amazon

> Test with Claude to map Eclipse's tone of voice on Amazon listings. Work alongside it until the direction feels right.

#### 02 — Encode

Title:

> Turn the way we work into something the system can hold.

Body:

> Skills capture brand voice, domain rules, taste. Individual knowledge becomes team infrastructure. What one person knew, the whole team now works from. Organisational memory, finally.

Example: Eclipse × Amazon

> Capture what works as a reusable skill: brand voice, Amazon constraints, product-specific rules. Anyone on the team can now produce copy in that voice.

#### 03 — Build

Title:

> Prototype tools nobody outside the team could spec.

Body:

> Navigation gives the intuition. Encoding gives the process. Together they're the foundation for tools built by the people who understand the problem best, in days, not months.

Example: Eclipse × Amazon

> When demand scales across products and markets, fold the skill into Babylon so copy generation lives next to localization in one pipeline.

---

## 4. Projects Introduction

Section label:

> Four tools · One roadmap

Headline:

> Reinvent workflows, pragmatically.

Body:

> Translating existing workflows to AI is only the first step. The real advantage is reimagining them: condensing the full loop from analytics to briefing to creation to review, so each cycle feeds the next one. Each tool below started by fixing a specific friction point, then grew into something the old workflow could never have supported.

Workflow mode legend:

- Repair: Fix the gaps between tools the team must keep using.
- Compress: Collapse fragmented steps into one continuous flow.
- Invent: Build a workflow that didn't exist before.

---

## 5. Positioning: Software for Few

Section label:

> Where this plays

Headline:

> Software for few.

Body:

> Off-the-shelf SaaS is too generic. A dev agency is too expensive for a team of ten. In that gap, AI lets the team build the tool themselves, in days, not months, by the people who understand the problem best.

Comparison:

- Off-the-shelf SaaS: Generic. Built for millions. Tag: Too broad.
- Software for few: Specific. Built by the team that uses it. Tag: The gap.
- Dev agency: Custom, but too expensive for a team of ten. Tag: Too costly.

---

## 6. Project Showcase

### 01 — Vesper

Status:

> Production

Team:

> Studio · Design · Product

Tagline:

> AI Image & Video Generation

Subline:

> Replaced Krea. Built in-house.

One-liner:

> Internal generation platform. Multi-model, prompt-enhanced, cost-transparent. Designed around the Studio team's daily flow.

Description:

> Through 2025, Loop ran dozens of AI campaigns with off-the-shelf tools. Vesper replaces them with software built for a team of ten, not a platform for the industry.

Workflow mode:

> Compress

Before:

> Designers switched between Krea for generation, Claude for prompting, and separate tabs for image-to-video. Costs were opaque and ballooning. Model choice overwhelmed the team; they only used 2–3 of a dozen options.

After:

> One interface: prompt enhancement, generation, and image-to-video in a single flow. Only the models Studio uses. Full cost transparency per generation. Creative momentum stays unbroken.

Prototype origin:

> Krea costs were escalating with no price transparency. The team was paying a markup on the same Google APIs we could access directly. The first prototype proved we could match the workflow in days.

Reuse signal:

> The prompt enhancer (Claude enriching visual prompts with product catalogue context) became a reusable pattern now shared across Vesper, Mímir briefing drafts, and ad copy generation.

Company leverage:

> Any team generating visual content (Product, E-commerce, CRM) can use Vesper without depending on Studio. Cost transparency gives leadership real spend-per-asset data for the first time.

Capabilities:

- Prompt enhancement: Claude-powered refinement, linked to the Loop product catalogue.
- Multi-model generation: Gemini Flash Image, Veo 3.1, Seedream, Kling in one interface.
- Animate still: Image-to-video without leaving the tab. Small fix, big flow.
- PDF image extraction: Pulls references out of brief docs directly. No more manual copy-paste.

Metrics:

- Campaigns shipped: Daily
- Margin vs. Krea: 0%
- Models unified: 6+

Stack:

- Next.js
- Supabase
- Claude
- Gemini
- Replicate
- Kling

Repository:

> https://github.com/tensalir/Loop-Vesper

Screenshots:

- Vesper: home dashboard
- Vesper: prompt enhancement
- Vesper: brainstorm mode
- Vesper: video generation
- Vesper: image-to-video

### 02 — Mímir

Status:

> WIP

Team:

> Creative Strategy · Product · Insights

Tagline:

> Brand Intelligence

Subline:

> Loop's own knowledge, structured.

One-liner:

> Brand intelligence for the whole company. Customer voice, ad performance, strategic research, and market signals in one place, usable by Creative Strategy, Product, and anyone building on Loop's own knowledge.

Description:

> Generation is commoditizing. The lasting advantage is in the intelligence going in, and for Loop, most of that intelligence already exists internally. Mímir makes it accessible: customer reviews, strategic research, ad performance, and audience personas in one interface. Creative Strategy uses it for briefings. Product uses it for persona development and product iteration. The same intelligence layer serves anyone who needs to think with Loop's data.

Workflow mode:

> Invent

Before:

> Creative strategists assembled briefings manually: pulling competitor ads from Meta Ad Library, scanning Reddit, checking a separate tool for performance data, and cross-referencing customer reviews in spreadsheets. No single view of the evidence.

After:

> One interface surfaces best-performing ads, customer reviews, strategic insight themes, and competitive signals as composable building blocks. Structured briefs are drafted from evidence, not from memory.

Prototype origin:

> Part of Project Proteus. The question was: what if we grounded every creative brief in the intelligence Loop already has internally, instead of starting from a blank page? The first version proved the concept in a week.

Reuse signal:

> The insights interface (customer reviews, strategic themes, performance data in one view) is becoming a shared module. Product Marketing is already using it to build personas and position new products like Aphrodite.

Company leverage:

> Mímir is already expanding beyond Creative Strategy into Product and Insights. Any team that needs to think with Loop's own data (product launches, market expansion, audience development, persona work) uses the same intelligence layer.

Capabilities:

- Customer voice: Synthesised evidence across customer reviews, buyer feedback, and the brand growth framework. Accessible to every team.
- Ad performance intelligence: First-party ad experiment data with KPI facets and variant-level drill-down. Used for briefings, personas, and product decisions.
- Structured brief generation: Three-panel composer that turns evidence into structured briefs. The same format works for creative, product, and strategy.
- External signals (next): Meta Ads Library, Reddit social listening, and Exa trend mining layering onto the first-party base.

Metrics:

- Intelligence sources: 4+
- Core uses: Briefs + personas
- Scope: Company-wide

Stack:

- Claude
- Supabase
- Meta Graph API
- Exa
- Perplexity

Repository:

> https://github.com/tensalir/mimir

Screenshots:

- Mímir: intelligence feed
- Mímir: briefing composer
- Mímir: May briefing output
- Mímir: Loop Ads performance
- Mímir: ad detail close-up
- Mímir: customer review insights
- Mímir: audience personas

### 03 — Babylon

Status:

> WIP

Team:

> Studio · UGC

Tagline:

> Copy, Localization & Dubbing Pipeline

Subline:

> One approval step instead of five.

One-liner:

> Translate, transcribe, dub, caption, QA — for video and copy. One pipeline connected to the Monday + Frontify workflow Loop already runs.

Description:

> The bottleneck was never translation, it was verification. Babylon cross-checks automated transcription against on-screen captions via Gemini, so proofreaders focus where human judgment actually matters.

Workflow mode:

> Invent

Before:

> There was no workflow. UGC localization was outsourced to agencies: slow, expensive, and disconnected from the tools the team already used. Translating Figma files required manual copy-paste across languages.

After:

> One pipeline: pull assets from Monday and Frontify, transcribe, visually verify against on-screen captions, translate with a brand-voice-aware model, dub, caption, and review. All connected to the existing approval flow.

Prototype origin:

> The UGC team needed to localize creator content at volume for market expansion. No off-the-shelf tool handled transcription, translation, dubbing, and review in one flow. The first prototype connected Monday assets to a transcription pipeline in three days.

Reuse signal:

> The review sheet, built originally for UGC proofreading, became a reusable module. It now powers Figma file translation review too. Any workflow that needs human verification of AI-generated text reuses the same component.

Company leverage:

> Copy and localization are company-wide needs. As Loop expands into new markets, Babylon scales from UGC dubbing to any content type (product copy, Figma assets, campaign materials) using the same translation and review infrastructure.

Capabilities:

- Monday + Frontify sync: One-click ingest from Creative Briefs. Dedup on re-sync.
- Caption-verified transcription: Gemini visual check against on-screen captions for timecode accuracy.
- Loop Localization skill: Brand-voice-aware translation across 30+ languages via Claude Skills.
- Timeline editor: Drag-and-drop caption editing with Remotion-powered animated captions.

Metrics:

- Languages supported: 30+
- Review steps: 1
- Pipeline: End-to-end

Stack:

- Next.js
- Supabase
- ElevenLabs
- Claude
- Gemini
- Remotion

Repository:

> https://github.com/tensalir/babylon

Screenshots:

- Babylon: pipeline overview
- Babylon: dubbing example
- Babylon: analytics dashboard

### 04 — Heimdall

Status:

> Production

Team:

> Cross-department

Tagline:

> Project Management Orchestration

Subline:

> Connects the tools that won't merge.

One-liner:

> The orchestration layer. Bridges Monday, Figma, and Frontify, moving information between systems that will never share a database.

Description:

> Monday, Figma, Frontify all do their jobs. The gaps are in moving information between them. Heimdall fills those gaps with webhooks, Figma plugins, and a unified ops pipeline.

Workflow mode:

> Repair

Before:

> Project managers briefed campaigns in Monday, then manually recreated each briefing inside Figma. Feedback lived in Figma comments, Monday updates, and Excel sheets, never in one place. Creative strategists toggled between tools to piece together what stakeholders actually said.

After:

> Monday webhooks trigger automatic briefing creation in Figma via a plugin. Feedback from Figma and Monday is summarised into a single sheet. The tools stay the same; the gaps between them disappear.

Prototype origin:

> Watching project managers copy the same briefing fields from Monday into Figma, every single day. Monday and Figma are stakeholder management tools too. You can't replace them, but you can eliminate the manual transfer between them.

Reuse signal:

> The feedback summariser module (aggregating comments across tools into one view) is reusable for any workflow where stakeholder input is scattered. The Figma plugin architecture powers both briefing sync and the Iterator variant tool.

Company leverage:

> Heimdall is the connective tissue. Any department running on Monday + Figma + Frontify benefits from automated handoffs. The orchestration layer scales from Paid Social production to any team that moves structured information between systems.

Capabilities:

- Briefing sync: Monday webhooks → Claude field extraction → Figma plugin creates template pages.
- Iterator plugin: In-Figma variant generation and format derivation (9:16, 4:5, 1:1).
- Feedback summariser: Aggregates Figma comments and stakeholder feedback across briefings.
- Forecast: Capacity-vs-forecast dashboards with sprint assignment push.

Metrics:

- Integrations: 8+
- Surfaces: Web + 2 Figma plugins
- Uptime: Production

Stack:

- Next.js 16
- Supabase
- Vercel KV
- Claude
- Figma Plugin API

Repository:

> https://github.com/tensalir/heimdall

Screenshots:

- Heimdall: briefing overview
- Heimdall: briefing detail
- Heimdall: Figma template sync
- Heimdall: Figma plugin
- Heimdall: feedback summariser

---

## 7. Scaling Section: Next Steps

Section label:

> Scaling the flywheel

Headline:

> Four tools prove the pattern. Now make it how Loop builds.

Body:

> Embed in the work, prototype fast, encode what works, expand. The next step is building the team to run this across the company, not as a program, but as operational infrastructure.

Proof points:

- 4 tools in production
- 140 Claude users
- 90% of briefings use AI
- 2 yrs embedded in Marketing

### Proposed Team

#### 01 — The hub: Creative Technologists

Title:

> Navigate, encode, build. Inside each team.

Body:

> One central hub coordinates the flywheel. Creative Technologists sit inside different teams, connected to each other, improving workflows from the inside out. What started in Marketing expands to the teams that need it.

#### 02 — Supporting: AI + Data Engineers

Title:

> Prepare the context everything else runs on.

Body:

> Clean, reliable internal data powers Mímir, Claude Skills, and every tool that follows. Data engineers from the AI and data team ensure that whether insights flow through a briefing agent or a Claude Skill, they start from a trusted source.

#### 03 — Supporting: Full-Stack Engineering

Title:

> Harden prototypes. Create reusable components.

Body:

> Vibe-coded prototypes prove the idea. A full-stack engineer makes them safe, stable, and reusable, so the next prototype starts from components instead of from scratch.

#### 04 — Supporting: Requirements + Coordination

Title:

> Keep priorities coherent across teams.

Body:

> A people business partner gathers requirements, documents what works, and keeps the bigger picture visible so institutional knowledge stops living in one head.

---

## 8. Footer / Closing Thought

Quote:

> "What I cannot create, I do not understand."  
> — Richard Feynman

Outro:

> That's the flywheel in one line. Two years of building to understand the work, then encoding it so the whole team can build from it.

Calls to action:

- Get in touch: vince.buyssens@loopearplugs.com
- GitHub: https://github.com/tensalir

Footer metadata:

> © Loop Earplugs · Creative Technology · Vince Buyssens  
> Built with Cursor + Claude Code

---

## 9. Strategic Brainstorming Prompts

Use these prompts with ChatGPT or another LLM to work on the content at a strategic level.

### Narrative Sharpness

> Review this showcase as a leadership narrative. What is the central argument, where does it feel strongest, and where does the story become too operational or too tactical?

### Executive Framing

> Rewrite the strategic thesis for a C-level audience. Keep the substance, but make the business value, organisational leverage, and investment ask sharper.

### Team Proposal

> Critique the proposed team model. What roles are missing, which roles could be merged, and what would make the operating model easier for leadership to approve?

### Proof & Evidence

> Identify which claims need stronger evidence. Suggest specific metrics, examples, before/after comparisons, or cost/time savings that would make the argument more credible.

### Portfolio Coherence

> Assess whether the four projects tell one coherent story. Which project best proves the thesis? Which project needs reframing to fit the narrative better?

### Positioning

> Improve the "Software for few" positioning. Make it feel less like a slogan and more like a strategic category Loop can invest in.

### Shorter Version

> Condense this into a 1-page executive memo with: context, problem, proof, strategic opportunity, proposed team, and next decision.

### Stronger Ending

> Propose three alternative endings that turn the showcase from a portfolio into a clear strategic ask.
