# Briefing Assistant v2 — Rollout

The Briefing Assistant has been rebuilt as a standalone multi-module tool at `/briefing-assistant`. It replaces the legacy sprint/split-based workflow with a research-driven creative workspace.

## What Changed

### Replaced
- Legacy sprint overview at `/briefing-assistant` (list of sprints with create modal)
- Legacy sprint workspace at `/briefing-assistant/[sprintId]` (split engine + assignment table)
- Old `(overview)` and `(sheet)` route groups

### New Modules
| Module | Route | Status |
|--------|-------|--------|
| Overview dashboard | `/briefing-assistant` | Shipped |
| Meta Ads Library | `/briefing-assistant/meta-ads` | Shipped |
| Trends | `/briefing-assistant/trends` | Shipped |
| Social Comments | `/briefing-assistant/social-comments` | Shipped |
| Create Ads (three-panel) | `/briefing-assistant/create-ads` | Shipped |
| Workflows | `/briefing-assistant/workflows` | Shipped |

### New Backend
| Endpoint | Purpose |
|----------|---------|
| `GET/POST /api/briefing-assistant/meta-ads` | Search + sync Meta ads |
| `GET /api/briefing-assistant/meta-ads/[adId]` | Ad detail with scores |
| `GET /api/briefing-assistant/source-items` | Source picker for Create Ads |
| `GET /api/briefing-assistant/source-items/[itemId]` | Single source item |
| `GET /api/briefing-assistant/trends` | Trend items |
| `GET /api/briefing-assistant/social-comments` | Social comment items |
| `GET/POST /api/briefing-assistant/workflows` | Workflow runs |
| `POST /api/briefing-assistant/analysis` | AI creative scoring |
| `POST /api/briefing-assistant/generate-asset` | Sacrificial asset generation |

### New Tables (migration 015)
- `briefing_source_items` — Normalized source data (ads, trends, comments, workflow outputs)
- `briefing_analysis_scores` — AI analysis scores per source item
- `briefing_generated_assets` — Generated sacrificial assets
- `briefing_workflow_runs` — Workflow execution history

### New Integrations
- `src/integrations/meta/client.ts` — Meta Ad Library API client
- `src/integrations/vesper/client.ts` — Vesper/Nano Banana generation gateway
- `src/domain/briefingAssistant/scoring/rubric.ts` — Performance Creatives 101 scoring rubric

## Auth Fix

The sheets auth cookie was scoped to `/sheets` path only, which caused briefing-assistant routes to fail authentication when `SHEETS_PASSWORD` was enabled. The cookie path has been changed to `/` in `app/api/sheets/auth/route.ts` so it covers both `/sheets/*` and `/briefing-assistant/*`.

## What Still Works

These existing systems are unchanged and fully functional:
- `/admin` — Admin dashboard, connections, settings, logs
- `/ops` — Briefing pipeline operations
- `/forecast` — Revenue forecasting
- `/sheets` — Comment sheets and feedback summarizer
- All existing API routes under `/api/briefing-assistant/sprints/*` still exist for any external references
- Monday.com webhook pipeline
- Figma plugin sync

## Env Requirements

New optional env vars for full functionality:
```
META_AD_LIBRARY_ACCESS_TOKEN=   # Meta Ad Library API access
GEMINI_API_KEY=                 # Direct Nano Banana generation (fallback)
VESPER_API_URL=                 # Vesper instance for image generation
VESPER_API_SECRET=              # Optional: Vesper server-to-server auth
```

Existing env vars remain unchanged.
