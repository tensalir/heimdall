# Loop Playbook Migration

One-shot pipeline that moves the Loop Earplugs playbook from SharePoint (Office 365) to **New** Google Sites.

Three independently runnable stages:

1. **Extract** — Microsoft Graph reads every page in the SharePoint site, normalizes its `canvasLayout` into typed JSON, and downloads referenced images. Also emits a clean Markdown rendition for human review.
2. **Translate** — A Claude skill (`skills/loop-playbook-migration/SKILL.md`) turns each `PageContent` into a deterministic `AuthoringPlan` with explicit manual-override checkpoints.
3. **Author** — A Playwright agent drives the New Google Sites editor block-by-block, leaves the page as a draft, and screenshots every step into `output/<slug>/`.

> **Why three stages?** New Google Sites has no public content API (the official Sites API and Apps Script `SitesApp` only support **Classic** Sites, which is sunset). Browser automation is the only realistic write path. Splitting extract from author means you can re-run either side without touching the other.

## Prerequisites

### One-time admin setup (Phase 0)

#### Microsoft Graph (read SharePoint)

1. Open the [Azure portal](https://portal.azure.com) → Microsoft Entra ID → **App registrations** → **New registration**.
2. Name: `loop-playbook-migration`. Supported account types: **single tenant**. Redirect URI: leave blank.
3. After creation:
   - **Overview** tab → copy *Directory (tenant) ID* and *Application (client) ID*.
   - **Certificates & secrets** → **New client secret** → copy the secret *value* (not the ID). Treat it like any other secret.
4. **API permissions** → **Add a permission** → **Microsoft Graph** → **Application permissions** → check `Sites.Read.All` → Add. Then click **Grant admin consent for <tenant>** (requires a Workspace admin).
5. Identify the SharePoint site:
   - Open the SharePoint site in a browser. The URL looks like `https://contoso.sharepoint.com/sites/PlaybookSite`.
   - `SHAREPOINT_HOSTNAME` is `contoso.sharepoint.com`.
   - `SHAREPOINT_SITE_PATH` is `/sites/PlaybookSite`.

#### Google Sites (write target)

No API, no service account. Authoring is browser-based against your real Google account:

1. Pick the destination Google Site in **edit mode**. Copy the full URL into `GOOGLE_SITES_EDIT_URL` (`https://sites.google.com/d/<siteId>/p/<pageId>/edit` or the home edit URL).
2. On the first author run you'll be prompted to log in once; the session is persisted in `.playwright-profile/` (gitignored). All subsequent runs reuse it.

#### Anthropic (translator)

Set `ANTHROPIC_API_KEY` to a key with access to the Claude model in `ANTHROPIC_MODEL` (default `claude-sonnet-4-20250514`).

### Install

```bash
cd tools/playbook-migration
npm install
npm run playwright:install
cp .env.example .env.local
# fill in the values from the steps above
```

`.env.local` is gitignored. **Never commit secrets.** Per the workspace `stack-security-preflight` skill, all secrets live in `.env.local` only.

## Usage

```bash
# 1. Extract every page in the SharePoint site to pages/<slug>.json + pages/<slug>.md
npm run extract

# Or extract a single page (handy for iteration):
npm run extract:one -- "Brand voice"

# 2. Translate every extracted page into output/<slug>.plan.json + output/<slug>.plan.md
npm run translate

# 3. Author. Dry-run first; it writes a preview to output/<slug>.preview.md without touching Sites.
npm run author:dry
npm run author -- "Brand voice"

# Or run extract -> translate -> author for one page in sequence:
npm run run-all -- "Brand voice"
```

## Where things end up

```
tools/playbook-migration/
  pages/
    <slug>.json        # canonical typed PageContent (machine format)
    <slug>.md          # clean Markdown export (also useful as a paste-from artifact while authoring is being built)
  assets/
    <slug>/             # downloaded images for that page
  output/
    <slug>.plan.json   # AuthoringPlan from the translator
    <slug>.plan.md     # human-readable plan rendering
    <slug>.preview.md  # dry-run preview of what would be authored
    <slug>/             # per-step screenshots from a real author run
      step-001-heading.png
      step-002-text.png
      ...
      transaction.json # log of every step + manual-override stops
  .playwright-profile/  # persistent Google login session
```

All of these are gitignored. The repo only contains source code.

## How the skill is loaded

`src/translate/translator.ts` reads `skills/loop-playbook-migration/SKILL.md` (relative to the repo root) and feeds it as the system prompt for Claude. Update the skill, re-run translate, and the plan changes immediately — no code edits needed.

This is by design: Phase 4 of the migration plan (after Gabriel's walkthrough video) consists almost entirely of editing that one skill file.

## Non-goals

- This is a **one-shot migration tool**. It is not a long-lived bidirectional sync. If SharePoint keeps changing during the cutover, run a final delta-extract before the production author pass.
- Not every SharePoint layout has a clean Google Sites equivalent. The translator emits `warnings` for blocks it cannot map cleanly; review those manually.
- The author stops at every `manualOverride` checkpoint and leaves a `[MANUAL: <reason>]` placeholder so Gabriel can finish banners, background colors, and hero imagery by hand.

## Smoke tests

Two no-config tests verify the pure-logic surfaces (Graph normalization, schema validation, dry-run preview) without any external dependencies:

```bash
npm run smoke
```

They run synthetic Graph payloads through `normalizePage`, walk a representative `AuthoringPlan` through `dryRunPage`, and assert the manual-override checkpoints land at the right block positions. Run these before pushing; they execute in a few seconds.

## Troubleshooting

- **`AADSTS500011: The resource principal named ... was not found in the tenant`** — Sites.Read.All hasn't been granted admin consent. Re-check API permissions in the Azure portal.
- **`itemNotFound` from `getSiteId`** — `SHAREPOINT_HOSTNAME` and `SHAREPOINT_SITE_PATH` don't resolve. Confirm the URL by opening it in a browser as the same admin.
- **Playwright selectors broken** — Google ships UI updates regularly. Edit `src/author/sitesEditor.ts` (every selector lives there) rather than scattering fixes.
- **`anthropic` 401** — `ANTHROPIC_API_KEY` not set, expired, or out of credit.
