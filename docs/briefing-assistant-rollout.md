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
META_AD_LIBRARY_ACCESS_TOKEN=   # Meta Ad Library API access (see token policy below)
GEMINI_API_KEY=                 # Direct Nano Banana generation (fallback)
VESPER_API_URL=                 # Vesper instance for image generation
VESPER_API_SECRET=              # Optional: Vesper server-to-server auth
```

Existing env vars remain unchanged.

## Meta Ad Library Token Policy

The Ads Library API requires a valid access token. Meta offers several token types:

| Type | Lifetime | How to obtain |
|------|----------|---------------|
| Long-lived User token | ~60 days | Exchange a short-lived token via `GET /oauth/access_token` with app ID + secret |
| System User token | Never expires | Business Manager > System Users > Generate Token (omit `set_token_expires_in_60_days`) |
| System User token (60d) | 60 days | Same flow, pass `set_token_expires_in_60_days=true` |

**Recommended:** Use a non-expiring System User token for production to avoid scheduled rotation. If compliance requires expiring tokens, use the 60-day variant and rotate before expiry.

### Token rotation runbook

1. Generate a new token via Business Manager or the `/oauth/access_token` exchange endpoint.
2. Update `META_AD_LIBRARY_ACCESS_TOKEN` in `.env.local` (local) and Vercel environment variables (production).
3. Restart the dev server or trigger a redeployment.
4. Call `POST /api/briefing-assistant/meta-ads?action=warm-thumbnails` to re-extract media for ads whose CDN thumbnail URLs may have expired with the old token.

### Diagnosing token issues

The sync and preview endpoints surface structured error messages when the token is missing, expired, or rejected by Meta. Look for:
- `META_AD_LIBRARY_ACCESS_TOKEN not configured` — env var is missing
- `Meta Ad Library token expired or invalid` — token needs rotation
- `Meta Ad Library API 400/401/190` — token was rejected by Meta
