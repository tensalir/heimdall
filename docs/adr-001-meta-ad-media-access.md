# ADR-001: Meta Ad Library Media Access Strategy

**Status:** Accepted  
**Date:** 2026-03-08  
**Deciders:** Engineering  
**Context:** Heimdall Briefing Assistant — Meta Ads Library module

---

## Decision

The Meta Ad Library official API (`/ads_archive`) does **not** return direct image or video URLs for competitor ads. Heimdall's current architecture — ingesting metadata via Apify/browser/API, extracting media from rendered snapshot pages, and mirroring assets to first-party Supabase storage — is the correct and only viable approach for production-quality ad media rendering.

No code changes are required. This document records the evidence and rationale so future contributors do not re-investigate this question.

---

## Context

A recurring question has been whether Meta's Developer APIs provide a sanctioned path to retrieve ad creative image/video files directly, which would eliminate the need for headless browser extraction and first-party media mirroring. Competitors Atria and Foreplay both serve ad media from their own CDN infrastructure, raising the question of whether they have access to a direct API path that Heimdall is missing.

---

## Evidence Summary

### 1. Official Meta Ad Library API (`/ads_archive` + `ArchivedAd` object)

**Source:** [Graph API v25.0: Ads Archive](https://developers.facebook.com/docs/graph-api/reference/ads_archive/), [Archived Ad](https://developers.facebook.com/docs/graph-api/reference/archived-ad/)

The `ArchivedAd` object returns these fields relevant to media:

| Field | What it contains | Usable as media source? |
|-------|-----------------|------------------------|
| `ad_snapshot_url` | URL to an HTML page that *renders* the ad (`/ads/archive/render_ad/?id=...&access_token=...`) | No — returns an HTML page, not a media file |
| `ad_creative_bodies` | Array of text strings (ad copy) | No — text only |
| `ad_creative_link_titles` | Array of link title strings | No — text only |
| `ad_creative_link_captions` | Array of link caption strings | No — text only |
| `ad_creative_link_descriptions` | Array of link description strings | No — text only |

There is **no** `image_url`, `video_url`, `thumbnail_url`, `creative_url`, `media_url`, or any other direct asset field on the `ArchivedAd` object. The official docs explicitly state:

> "While you cannot currently download a batch of archived ads, you can download ad creative such as images and text for an individual ad. If you do so, it must be for analysis and you must comply with the data storage terms."

This language refers to manually downloading from the rendered `ad_snapshot_url` page — not to a programmatic media endpoint.

**Confidence: 10/10** — verified directly from the v25.0 reference docs as of March 2026.

### 2. The `ad_snapshot_url` is an HTML page, not a media file

**Sources:** [Stack Overflow #68258811](https://stackoverflow.com/questions/68258811/how-can-i-get-ad-image-video-from-facebook-ad), [Stack Overflow #60658027](https://stackoverflow.com/questions/60658027/facebook-ad-library-ad-snapshot-urls-are-broken), [Meta Developer Community thread](https://developers.facebook.com/community/threads/195434458979720/)

The URL format is `https://www.facebook.com/ads/archive/render_ad/?id={ID}&access_token={TOKEN}`. This returns a full HTML page with embedded JavaScript that renders the ad creative client-side. To extract the actual image/video:

- A browser must render the page
- The media appears as `<img>` and `<video>` elements sourced from FB CDN (`scontent-*.fbcdn.net`, `video-*.fna.fbcdn.net`)
- These CDN URLs are ephemeral — they contain signed tokens that expire

The Stack Overflow question "How can I get ad image/video from facebook ad" (July 2021, 912 views, **zero answers**) and the Meta Developer Community question "How to get ad image url from ad_snapshot_url" (2021, **no solution posted as of 2026**) confirm no official workaround exists.

**Confidence: 10/10** — consistent across all sources since 2020, unchanged through 2026.

### 3. Marketing API (`/ad-creative`, `/previews`, `/ad-creative-video-data`) is irrelevant

**Source:** [Ad Creative](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/), [Ad Creative Previews](https://developers.facebook.com/docs/marketing-api/reference/ad-creative/previews/)

These endpoints are for **your own ads** managed through your own Ad Account. They require the creative ID from your own campaign, not a Library ID from a competitor's ad. The `image_url`, `video_id`, and `thumbnail_url` fields on `AdCreative` are write-path fields for creating ads, not read-path fields for competitor research.

The `/previews` edge returns an HTML iframe snippet (valid for 24 hours) — not a downloadable media file.

Meta's own docs on `AdCreativeVideoData.image_url` explicitly warn: "You should not use image URLs returned from the FB CDN but instead have the image hosted on your own servers."

**Confidence: 10/10** — these APIs are architecturally scoped to advertiser-owned creatives.

### 4. Non-EU commercial ads have additional retrieval restrictions

**Source:** [About the Meta Ad Library](https://www.facebook.com/business/help/2405092116183307), [Transparency Center](https://transparency.meta.com/researchtools/ad-library-tools/)

For commercial ads outside the EU/UK:
- Only **active** ads appear in the Ad Library
- No archival period once deactivated
- No spend/impression data
- The API may return sparse results depending on region (documented by multiple Stack Overflow and community threads)

For EU/UK ads and political/issue ads, more data is available, but still no direct media URLs.

**Confidence: 9/10** — well-documented but Meta occasionally adjusts regional availability.

### 5. Third-party scraping services confirm the same limitation

**SearchAPI** (`searchapi.io/meta-ad-library-api`): Their reverse-engineered API scrapes Meta's Ad Library web interface and returns structured `snapshot.images[].original_image_url` and `snapshot.videos[].video_hd_url` fields with direct `fbcdn.net` / `fna.fbcdn.net` URLs. These are extracted from the rendered DOM — not from an official API field. This is the same approach Heimdall uses.

**Apify** (`corner_cutter/facebook-ad-library-scraper`): Scrapes the Ad Library web UI. Returns creative data extracted from the page, not from an API response.

**SociaVault** / **Adligator** / **ScrapeCreators**: All third-party services that wrap scraping infrastructure. None claim to use an official Meta media endpoint. Adligator's 2026 guide explicitly states: "No creative files: The API returns text content and links but not actual image or video files."

**Confidence: 9/10** — third-party behavior is strong circumstantial evidence; internal implementation details are inferred.

### 6. Atria and Foreplay use extraction + first-party CDN serving

**Atria** (`cdn.tryatria.com`): AWS-hosted CDN subdomain serves resized ad images and video. Their product page describes "25 million winning ads" with persistent storage — "even inactive ads are kept forever." This is only possible through extraction and mirroring, since Meta removes inactive non-political ads from the library.

**Foreplay** (`foreplay.co`): Spyder feature "saves all tracked ads permanently rather than allowing them to expire" and surfaces "videos, images, creative velocity, transcription." Their API exposes media through their own endpoints, not Meta CDN URLs. Their Spyder product scrapes the Ad Library daily and stores results.

Neither product claims official API media access. Both serve media from their own infrastructure after extraction — exactly the pattern Heimdall implements.

**Confidence: 8/10** — inferred from product behavior, public CDN domains, and marketing copy; not confirmed from internal architecture.

---

## Alignment With Current Heimdall Implementation

### Pipeline architecture (confirmed correct)

```
Ingestion:
  Apify actor OR headless Puppeteer OR Graph API (/ads_archive)
         |
         v
  Metadata stored (text fields, ad_snapshot_url, page info)
  thumbnail_url = null, creative_url = null at ingest time
         |
         v
Post-ingest extraction (background):
  Open ad_snapshot_url in headless browser
  Extract <img>/<video> CDN URLs from rendered DOM
  Mirror poster to Supabase Storage (briefing-media bucket)
  Update thumbnail_url with signed Supabase URL
         |
         v
Browse-time serving:
  thumbnail_url (mirrored) -> direct serve
  creative_url (mirrored or source CDN) -> direct serve
  Fallback: /preview endpoint -> extract + screenshot
         |
         v
On-demand actions:
  "Save to CDN" -> mirror video to Supabase
  warm-thumbnails -> bulk backfill missing posters
  cleanup-media -> reclaim stale competitor assets
```

### Implementation files and their roles

| File | Role | Status |
|------|------|--------|
| `src/integrations/meta/client.ts` | Official Graph API client; returns metadata + `ad_snapshot_url` (no media) | Correct |
| `src/integrations/meta/browserScraper.ts` | Headless Puppeteer scraping of Ad Library web UI | Correct |
| `src/integrations/apify/metaAdsScraper.ts` | Apify actor integration for bulk scraping | Correct |
| `src/integrations/meta/preview.ts` | Snapshot page rendering, DOM media extraction, screenshot fallback | Correct |
| `src/integrations/meta/mediaMirror.ts` | Downloads CDN media, uploads to Supabase, returns signed URL | Correct |
| `src/domain/briefingAssistant/metaAds/media.ts` | Orchestration: warmup, promote, cleanup lifecycle | Correct |
| `src/domain/briefingAssistant/metaAds/ingest.ts` | Source-mode selection (apify/browser/api/auto) | Correct |
| `lib/media-utils.ts` | URL validity rules rejecting `render_ad`, `ads/library`, and `data:` URLs | Correct |

### Risk assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| FB CDN URLs expire (signed tokens) | Medium | Already mitigated — poster mirroring to Supabase replaces ephemeral CDN URLs with durable signed URLs |
| Login walls block headless extraction | Medium | Already mitigated — `isLoginWall()` detection with placeholder fallback + self-heal on next request |
| Apify actor rate limits or cost spikes | Low | Auto-mode falls back to browser scraper; warmup is bounded (10 per sync, 50 per bulk) |
| Meta ToS compliance for stored media | Low | `ad_snapshot_url` docs permit downloading "for analysis" with ToS compliance; media is private-bucketed with signed URLs, not publicly redistributed |
| Snapshot page DOM structure changes | Low | Extraction uses generic `<img>`/`<video>` selectors with CDN URL pattern matching, not brittle class-name selectors |

### No mismatch risks identified

The codebase correctly implements the only viable strategy. The `normalizeMetaAd()` function in `client.ts` correctly sets `thumbnail_url: null` and `creative_url: null` at API-ingestion time, because the API genuinely does not provide these fields. Media is populated later through the extraction pipeline.

---

## Alternatives Considered

### A: Use official API media fields
**Rejected** — no such fields exist on `ArchivedAd`. The Marketing API creative endpoints require advertiser-owned creative IDs, not Library IDs.

### B: Use Marketing API `/previews` for competitor ads
**Rejected** — requires a `creative_id` from your own ad account. Cannot be used to preview competitor creatives. Returns an HTML iframe, not a media file. Previously noted as "not the right general solution" in plan history.

### C: Hotlink FB CDN URLs directly without mirroring
**Rejected** — CDN URLs contain signed tokens that expire within hours to days. Causes broken images in the browse UI. Already classified as invalid by `lib/media-utils.ts` URL validity rules.

### D: Use a third-party API service (SearchAPI, SociaVault, etc.)
**SearchAPI adopted as opt-in provider** (2026-03-08) — SearchAPI scrapes the same Ad Library web UI but returns structured JSON with `original_image_url`, `video_hd_url`, and pagination, reducing headless browser overhead. It does not change the fundamental media truth (FB CDN URLs are still ephemeral), so the mirror pipeline remains essential. SearchAPI is wired as `source_mode=searchapi` behind `SEARCHAPI_API_KEY`. It can be evaluated against Apify/browser on coverage, latency, and cost before promotion to `auto` chain.

---

## Consequences

1. **No action required** — the current architecture is validated.
2. **Future contributors** should not attempt to find an official Meta API for ad media files. This ADR documents that no such endpoint exists as of March 2026 (Graph API v25.0).
3. **If Meta adds a direct media API in the future**, the integration point would be in `normalizeMetaAd()` in `client.ts` — populate `thumbnail_url` and `creative_url` directly from API response fields, and the rest of the pipeline (mirror, serve, fallback) would continue to work unchanged.
4. **Operational focus** should remain on extraction reliability (login wall avoidance, proxy configuration, browser pool health) and mirror pipeline efficiency (warmup coverage, cleanup cadence).
