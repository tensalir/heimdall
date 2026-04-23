# Heimdall

> Connective workflow software for Loop Earplugs. Bridges Monday.com, Figma, Frontify, and the data sources the creative team depends on.

## Why this exists

Loop's design briefings live in Monday.com Docs. The design team works in Figma. Connecting the two was a manual copy-paste job: read the Monday Doc, find the right Figma file for the current month, create a page following the template format, paste the content. Error-prone at volume, and the volume keeps growing.

The initial ask was simple: can we move briefings from Monday into Figma automatically, following specific template formats? That took some figuring out. Monday stores structured data you can pull via their API, but Figma is an infinite canvas with a very different architecture. Once I got briefing sync working, the scope expanded. Creative strategists needed feedback aggregation across stakeholders. The paid-social team needed competitive intelligence and trend discovery to feed better briefs. Operations needed pipeline visibility without opening three different tools.

The larger pattern: these tools are not going away. Monday, Figma, Frontify all do their jobs. The gaps are in moving information between them and surfacing patterns across them. Heimdall fills those gaps.

## What it does

Heimdall is a multi-surface internal tool. An admin hub manages connections and system health. An ops pipeline gives the broader team visibility into briefing status. A briefing assistant (Mimir) pulls competitive ads, trends, and social signals into a research workspace that feeds directly into briefing creation. Figma plugins sync briefings to canvas and derive format variants. Feedback sheets aggregate stakeholder input. A forecast module projects creative workload against sprint capacity.

Everything runs as a single Next.js application deployed on Vercel, with two Figma plugins that talk to the same API layer.

## Key capabilities

**Ops pipeline.** Monday.com board registration, per-board kanban view with pipeline status, batch scoping, and aggregate metrics. Any authenticated user can access ops; admin surfaces require elevated privileges.

**Briefing sync.** Monday webhook integration creates jobs when briefings update. Claude extracts structured fields from unstructured Monday Docs. The Heimdall Figma plugin syncs queued briefings into monthly template files with idempotent page creation and routing-map-driven file targeting.

**Mimir (briefing assistant).** Multi-module research tool for creative strategists:
- Meta Ads Library browser with multiple ingestion modes (Meta Graph API, SearchAPI, Apify, browser scraper)
- Trend discovery via Exa web search, scored by Claude and digested by Perplexity
- Social listening / Reddit comment aggregation with the same scoring pipeline
- Briefing composer: three-panel workflow from source research through brief authoring to Monday delivery
- Automated research workflows with execution history
- Sprint-scoped briefing lists with learnings capture

**Iterator (Figma plugin).** AI-powered creative iteration inside Figma:
- Create Variant: clone an experiment frame, generate replacement imagery via Gemini, apply placement review and crop adjustments
- Resize / Derive Formats: take a master frame and produce 9:16, 4:5, and 1:1 derivatives with proportional scaling, text reflow, and per-image placement review

**Feedback summariser.** Sheet-based review surface for aggregating Figma comments and stakeholder feedback across briefings and creatives. Figma file picker, project browser, and stakeholder round management.

**Forecast.** Workbook import, run management, capacity-vs-forecast dashboards, parity checks, and sprint assignment push.

**Document collections.** Corpus management for Loop's internal knowledge base: collection CRUD, multi-format document upload and parsing (PDF, DOCX, XLSX, CSV via LlamaParse and local extractors), Voyage AI embeddings stored in Supabase, and a GPT Actions OpenAPI surface for retrieval.

**Frontify intake.** Submission inbox and library configuration for incoming Frontify assets, with per-library browsing.

**HiBob leave sync.** Daily cron reconciles HiBob time-off data with Monday.com boards. Webhook handler processes real-time leave change events.

**Admin hub.** Connections dashboard with integration health checks, board-to-Figma routing editor, setup checklist, settings, plugin job queue, and system logs.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 16 (App Router), React 19, TypeScript 5 |
| UI | Tailwind CSS 4, Radix UI, shadcn/ui, Lucide icons |
| Database | Supabase (Postgres + Auth + Storage) |
| Cache / queue | Vercel KV (Redis) with in-memory dev fallback |
| AI | Anthropic Claude (field mapping, scoring, briefing generation), Google Gemini (image generation, placement review), Voyage AI (embeddings) |
| Search / discovery | Exa (web search), Perplexity (digest synthesis) |
| Ad intelligence | Meta Graph API, SearchAPI, Apify |
| Document parsing | LlamaParse, mammoth, pdf-parse, xlsx, csv-parse |
| Image processing | sharp, Puppeteer + serverless Chromium (headless capture) |
| External platforms | Monday.com (GraphQL), Figma (REST + Plugin API), Frontify (GraphQL), HiBob (REST), Vesper (image generation gateway), Babylon (localization ingest) |
| Hosting | Vercel (functions, crons, KV) |
| Monorepo | npm workspaces: `packages/figma-plugin`, `packages/iterator-plugin`, `packages/design-system` |
| Testing | Vitest, Testing Library |
| CI | GitHub Actions (build gate on main) |

## Project structure

```
app/
  admin/                # Connections, settings, plugin queue, logs, Frontify intake
  ops/                  # Briefing pipeline kanban and batch views
  briefing-assistant/   # Mimir: meta-ads, trends, social, create-ads, workflows, briefings
  sheets/               # Figma comment sheets and stakeholder feedback
  forecast/             # Capacity and workload forecasting
  document-chat/        # Collection and document management
  api/                  # Webhooks, crons, plugin endpoints, domain APIs
  login/                # Supabase auth entry
components/
  ui/                   # shadcn/ui design system
  ops/                  # Ops-specific components
  briefing-assistant/   # Mimir components
  sheets/               # Sheet and comment components
  forecast/             # Forecast components
lib/
  kv.ts                 # Vercel KV persistence (queue, logs, settings)
  supabase.ts           # Supabase server client
  route-auth.ts         # API route classification (user / machine / webhook / public / gpt_actions)
  access-control.ts     # Domain and role-based access policy
  document-chat/        # Embedding, parsing, ingest, OpenAPI spec
src/
  agents/               # Claude mapping agent
  domain/               # Briefing, forecast, briefing-assistant domain logic
  integrations/         # Monday, Figma, Frontify, Meta, HiBob, Vesper, Apify, SearchAPI, Babylon
  services/             # Trend discovery, social listening, leave sync, telemetry
  orchestration/        # Figma page creation and queueing
  iterator/             # Gemini client, placement reviewer, orchestrator for Iterator plugin
  contracts/            # Shared typed interfaces
  config/               # Env schema (Zod-validated)
packages/
  figma-plugin/         # Heimdall Figma plugin (sync-briefings, export-comments)
  iterator-plugin/      # Iterator Figma plugin (iterate, derive-variants)
  design-system/        # Shared tokens and components
```

## Auth model

All page routes use Supabase session authentication. Privileged routes (`/admin`, `/briefing-assistant`, `/sheets`, `/forecast`, `/document-chat`) require full-access roles. `/ops` is accessible to any authenticated user. API routes are classified by policy: `user`, `machine` (shared-secret), `webhook`, `gpt_actions` (bearer token), or `public`. Sheets read APIs also accept a cookie-based password fallback for lightweight external sharing.

## Getting started

Prerequisites: Node.js 20+, npm, Vercel account (for KV), access credentials for Monday.com, Figma, and Supabase at minimum.

```bash
npm install
npm run dev            # Next.js on port 3846
```

Additional credentials for Frontify, Meta, HiBob, Anthropic, Gemini, Voyage AI, Exa, and Perplexity enable their respective features. See the repo's internal setup documentation for required configuration categories.

For the Figma plugins:

```bash
npm run build:plugin      # Heimdall plugin
npm run build:iterator    # Iterator plugin
```

Deployment: see [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel guide.

## Current frontier

Exploring deeper integration between Mimir's competitive intelligence and the briefing template pipeline. Loop Data modules (ads performance, strategic insights) are stubbed and waiting for live data connections. The Iterator plugin's "Generate from Briefing" command is wired as a UI skeleton, pending backend integration. The roadmap tracks what the team surfaces as friction, not a predetermined feature list.
