# Heimdall Architecture

Heimdall is the connector between Monday.com, Figma, and reviewer-facing
feedback surfaces. Named after the Norse guardian of the Bifrost bridge.

## Route Architecture

```
/                          → Redirects to /admin
/admin/*                   → Admin dashboard (Supabase session auth)
/sheets/*                  → Comment sheets (cookie auth via SHEETS_PASSWORD)
/sheets/login              → Password gate for sheets
/briefing-assistant/*      → Standalone Briefing Assistant tool (cookie auth)
/forecast/*                → Forecast module (Supabase session auth)
/feedback/*                → Feedback module (Supabase session auth)
/ops/*                     → Operations pipeline (Supabase session auth)
/api/*                     → Shared API layer (CORS enabled, no page auth)
```

## Capability Namespaces

| Namespace              | Audience     | Auth              | Purpose                                      |
|------------------------|-------------|-------------------|----------------------------------------------|
| `/admin`               | Internal    | Supabase session  | Operational dashboard, job queue, config      |
| `/sheets`              | Reviewers   | Cookie / password | Shareable feedback artifacts                  |
| `/briefing-assistant`  | Creative Strategy | Cookie / password | Standalone creative briefing tool        |
| `/forecast`            | Internal    | Supabase session  | Revenue forecasting and asset planning        |
| `/ops`                 | Internal    | Supabase session  | Briefing pipeline operations                  |
| `/api`                 | Machines    | CORS only         | Plugin, dashboard, and automation APIs        |

### Rules

- A route belongs to exactly one capability namespace.
- If a feature needs both admin and reviewer UX, create pages in both
  groups and share backend APIs.
- Sheet URLs are permanent once shared. Never rename; add redirects.
- Admin auth and reviewer auth are independent by design.
- The Briefing Assistant is a standalone tool with its own sidebar navigation,
  separate from the Heimdall admin panel. It shares global tokens and auth.

## Briefing Assistant v2

The Briefing Assistant is a standalone multi-module tool at `/briefing-assistant`.
It has its own left sidebar with five modules:

| Module              | Route                                    | Purpose                                    |
|---------------------|------------------------------------------|--------------------------------------------|
| Overview            | `/briefing-assistant`                    | Dashboard with module cards and activity   |
| Meta Ads Library    | `/briefing-assistant/meta-ads`           | Search, browse, and analyse ads from Meta  |
| Trends              | `/briefing-assistant/trends`             | Emerging creative trends and formats       |
| Social Comments     | `/briefing-assistant/social-comments`    | Qualitative insights from social/reviews   |
| Create Ads          | `/briefing-assistant/create-ads`         | Three-panel workflow: source → brief → asset |
| Workflows           | `/briefing-assistant/workflows`          | Automated research agents and reports      |

### Data Architecture

- **Source items** (`briefing_source_items`): Normalized ads, trends, comments, and workflow outputs.
- **Analysis scores** (`briefing_analysis_scores`): AI-scored creative evaluation per source item.
- **Generated assets** (`briefing_generated_assets`): Sacrificial assets from Nano Banana via Vesper.
- **Workflow runs** (`briefing_workflow_runs`): Execution history for automated research agents.

### Integration Points

- **Meta Ad Library API** (`src/integrations/meta/client.ts`): Fetches ads from Meta Ad Library.
- **Vesper Gateway** (`src/integrations/vesper/client.ts`): Image generation via Vesper or direct Gemini API.
- **Scoring Rubric** (`src/domain/briefingAssistant/scoring/rubric.ts`): Performance Creatives 101 framework.
- **Monday.com**: Existing send-to-Monday pipeline for briefings.
- **Evidence RAG**: Existing vector search for angle generation.

## Adding a New Feature

1. **Audience**: Who uses it? (`admin`, `reviewer`, `plugin`, `automation`)
2. **Shareable URL?**: If yes → `/sheets/*`. If no → `/admin/*`.
3. **API**: Create endpoints under `/api/<domain>/*`.
4. **Domain logic**: Place in `src/domain/<feature>/`.
5. **Integration**: External provider clients go in `src/integrations/`.
6. **Contracts**: Shared DTOs live in `src/contracts/`.

### Module Pattern

```
feature: <name>
  app/admin/<name>/*          # internal controls
  app/sheets/<name>/*         # external reviewer UX (if applicable)
  app/api/<name>/*            # API transport
  src/domain/<name>/*         # domain logic and schemas
  src/contracts/              # shared typed contracts
  src/integrations/*          # external provider clients
```

## Unified integration foundation

Tools (Briefing Assistant, Comment Summarizer, plugin) share a single integration layer so they do not duplicate vendor logic and do not interfere with each other:

- **Contracts** (`src/contracts/integrations.ts`): Vendor-neutral types (`BatchRef`, `WorkItemRef`, `ResolvedBatchTarget`, `SyncOutcome`, `IntegrationError`).
- **Providers** (`src/integrations/providers/`): `MondayProvider`, `FigmaProvider`, `FrontifyProvider` (scaffolded) wrapping raw clients.
- **Routing** (`src/services/integrationRoutingService.ts`): Batch → canonical key, Monday board id, Figma file key (env map + optional Figma filename match).
- **Execution guards** (`src/services/integrationExecutionGuard.ts`): Tool-namespaced idempotency keys (`briefing:monday:...`), lock keys, retryable error classification.
- **Board reader** (`src/services/mondayBoardReader.ts`): Single paginated Monday board fetch with column enrichment; used by feedback sync and batch dropdown.
- **Telemetry** (`src/services/integrationTelemetry.ts`): Consistent `integration` log category with `tool`, `provider`, `operation`, `durationMs`, `outcome` for dashboard/ops.

New features should use these services instead of calling Monday/Figma clients directly.

## Key Integrations

| Service       | Purpose                        | Config                   |
|--------------|--------------------------------|--------------------------|
| Monday.com   | Briefing source, webhooks      | `MONDAY_API_TOKEN`       |
| Figma        | Template sync, comment reading | `FIGMA_ACCESS_TOKEN`     |
| Supabase     | Comment cache, summaries       | `SUPABASE_URL`           |
| Vercel KV    | Job queue, operational state   | `KV_REST_API_URL`        |
| Anthropic    | AI node mapping, summaries     | `ANTHROPIC_API_KEY`      |
| Meta Ad Library | Ad ingestion for briefing   | `META_AD_LIBRARY_ACCESS_TOKEN` |
| Apify        | Meta ads scraping (Apify actor) | `APIFY_API_TOKEN`       |
| SearchAPI    | Meta ads scraping (structured JSON) | `SEARCHAPI_API_KEY`  |
| Gemini       | Nano Banana image generation   | `GEMINI_API_KEY`         |
| Vesper       | Image generation gateway       | `VESPER_API_URL`         |

## Figma Plugin

Lives in `figma-plugin/`. Communicates exclusively via `/api/*` routes.
No changes needed to plugin when admin/sheets routes change.

## Cross-Repo Standards (Babylon + Heimdall)

- Shared shadcn component baseline (Button, Card, Badge, Input, etc.)
- Shared token contract (semantic colors, spacing, radii)
- `components.json` for consistent shadcn CLI usage
- Claude frontend-design skill for quality guardrails
