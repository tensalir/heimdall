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

## Browser-Primary Ingestion

The Meta Ads Library is now ingested via browser scraping by default, with the Graph API as a fallback. This avoids bulk media storage while still showing ads quickly in the library UI.

### Source mode

Set `META_ADS_SOURCE_MODE` to control the ingestion source:

| Value | Behavior |
|-------|----------|
| `auto` (default) | Browser scrape first; falls back to API if browser returns 0 results |
| `browser` | Browser scrape only |
| `api` | Graph API only (requires `META_AD_LIBRARY_ACCESS_TOKEN`) |

### Region and proxy

- `META_ADS_DEFAULT_REGION` — ISO country code for scraping (default `US`). The UI region filter overrides this per-request.
- `META_ADS_PROXY_URL` — HTTP or SOCKS proxy URL for the headless browser. Useful when the server is in the EU and Meta returns sparse results for certain regions.

### Atlas Browser View

The "Atlas View" button on gallery cards and the detail page opens a modal that renders a full-page screenshot of the ad as it appears on the Meta Ads Library. This uses the endpoint:

```
GET /api/briefing-assistant/meta-ads/<id>/atlas?width=600&height=900
```

Responses are cached for 1 hour. Pass `&fresh=true` to bypass cache.

## Media Mirror Pipeline

Ad thumbnails and videos are mirrored to Supabase Storage (`briefing-media` bucket) on demand, not during browse time.

1. **On sync**: newly ingested ads get thumbnail extraction via Puppeteer + poster mirroring to storage in background.
2. **On preview request**: if a card's `thumbnail_url` is invalid, the `/preview` endpoint triggers self-healing extraction + mirror in the background.
3. **On-demand mirror**: users can explicitly mirror media (thumbnail + video) by clicking "Save to CDN" on the detail page, or via:
```bash
curl -X POST "https://your-domain/api/briefing-assistant/meta-ads?action=mirror-media" \
  -H "Content-Type: application/json" \
  -d '{"item_id":"<uuid>","type":"video"}'
```
4. **Manual backfill**: `POST /api/briefing-assistant/meta-ads?action=warm-thumbnails` processes up to 50 ads with missing thumbnails per call.

Video mirroring no longer happens automatically when a user opens the detail page. This keeps storage costs low and makes media downloads an explicit user action.

### Storage setup

The `briefing-media` bucket is created by migration `017_briefing_media_storage.sql`. It must be **public** for gallery cards to load images directly. Run the migration via the Supabase dashboard SQL editor if it hasn't been applied.

### Health check

`GET /api/briefing-assistant/meta-ads?check=health` returns:
- `token.configured` / `token.valid` — Meta API token status
- `provider.mode` / `provider.default_region` / `provider.proxy_configured` — ingestion source configuration
- `provider.browser_sourced_ads` / `provider.api_sourced_ads` — ads by source
- `ads.total` / `ads.poster_mirrored` / `ads.poster_missing` — thumbnail coverage
- `ads.poster_direct_thumb` — ads with direct CDN thumbnails (not yet mirrored)
- `ads.video_detected` / `ads.video_promoted` — video ad state
- `ads.fallback_rate` — percentage of ads falling back to `/preview`

### Full backfill procedure

After a token rotation or initial setup:
```bash
# Repeat until remaining=0
curl -X POST "https://your-domain/api/briefing-assistant/meta-ads?action=warm-thumbnails"
```

## Atria-Style Media Tiers

The media pipeline uses tiered storage to balance cost and quality:

| Tier | Poster | Video | Retention | When |
|------|--------|-------|-----------|------|
| `poster_only` | Mirrored to storage | Not mirrored (source URL stored) | 90 days since last updated | Default for competitor ads |
| `video_promoted` | Mirrored | Mirrored | 14 days idle, extends on view | User clicks "Save to CDN", or ad is used in workflow |
| `first_party` | Mirrored | Mirrored | Permanent | Your own brand's ads / Frontify assets |

### Video promotion

Videos are promoted to durable storage when a user explicitly triggers it via the "Save to CDN" button on the detail page, or via:
```bash
curl -X POST "https://your-domain/api/briefing-assistant/meta-ads?action=promote-video" \
  -H "Content-Type: application/json" \
  -d '{"item_id":"<uuid>"}'
```

### Storage cleanup

Run periodically to reclaim space from stale competitor media:
```bash
curl -X POST "https://your-domain/api/briefing-assistant/meta-ads?action=cleanup-media"
```

First-party assets are never cleaned up automatically.

### Schema migration

Run `supabase/migrations/018_media_tier_lifecycle.sql` via the Supabase SQL Editor to add the media lifecycle columns (`media_tier`, `source_video_url`, `video_status`, `last_viewed_at`, `last_played_at`, `media_mirrored_at`). The application works without these columns but provides richer tier-aware behavior when they are present.
