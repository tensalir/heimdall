# Heimdall Figma Plugin — Onboarding Guide

## What this plugin does

Heimdall syncs briefings from Monday.com into Figma template pages and exports Figma comments for review. It runs against a production backend hosted on Vercel, so you don't need to run anything locally.

## Setup (one-time)

### 1. Install the plugin

Open Figma, go to **Plugins > Manage plugins > Your organization**. Find "Heimdall" and install it.

### 2. Configure the plugin

Run the plugin from **Plugins > Heimdall > Sync Briefings**. In the settings panel:

- **API Base**: Should already be set to the production URL. If not, enter: `https://bifrost-rose.vercel.app` (no trailing slash).
- **Plugin Token**: Enter the token you received from Vince. This authenticates your plugin against the backend (`X-Heimdall-Plugin-Token` → must match `HEIMDALL_PLUGIN_SECRET` on Vercel).

Click **Save** for both fields. These are stored in your Figma client and persist across sessions.

### 3. Vercel Deployment Protection (important)

If **Vercel Deployment Protection** (or similar) is enabled on the URL you use as API base, the plugin will get **HTTP 401** or **HTML instead of JSON**—the plugin cannot complete a browser login flow.

**Fix (pick one):**

- Use a **production** deployment hostname that does not require Vercel Authentication for `/api/*`, or
- Adjust Vercel project settings so machine routes used by the plugin are reachable without an interactive session (per your org’s security policy).

The default API host is defined in [packages/figma-plugin/src/constants.ts](../packages/figma-plugin/src/constants.ts); change and republish the plugin if your canonical URL moves.

## Verifying production (operators)

From a machine with `curl` (replace `YOUR_PLUGIN_TOKEN`):

```bash
curl -sS -X POST "https://bifrost-rose.vercel.app/api/plugin/briefings" \
  -H "Content-Type: application/json" \
  -H "X-Heimdall-Plugin-Token: YOUR_PLUGIN_TOKEN" \
  -d '{"fileName":"APRIL 2026 - PerformanceAds","fileKey":"YOUR_FIGMA_FILE_KEY"}'
```

- **200 + JSON** with `items` / `batch`: auth and route are OK.
- **401** before JSON: often deployment protection or wrong host.
- **403** + `Machine authentication required`: token mismatch or missing `HEIMDALL_PLUGIN_SECRET` on that deployment.
- **503** + `Machine authentication not configured`: neither `HEIMDALL_PLUGIN_SECRET` nor `HEIMDALL_MACHINE_SECRET` is set in production.

Also confirm on Vercel: `MONDAY_API_TOKEN`, and for batch auto-discovery `FIGMA_ACCESS_TOKEN` (see app env docs).

## Using the plugin

### Sync Briefings

1. Open a monthly Figma file (the one that matches the current batch).
2. Run **Plugins > Heimdall > Sync Briefings**.
3. The plugin will fetch queued briefings from the backend and create/update template pages.
4. Each synced page gets tagged with the Monday item ID for tracking.

### Export Comments

1. Open any Figma file.
2. Run **Plugins > Heimdall > Export Comments**.
3. The plugin fetches all comments from the file and displays them in a readable format.
4. You can open the full comment sheet in your browser from the plugin UI.

Note: `/api/comments` is a **user-authenticated** route in the web app; if comment export fails with 401/403 while sync works, you may need to use flows that run in an authenticated browser context, or adjust routing/auth for your deployment.

## Troubleshooting

**"Machine authentication required" error**: Your plugin token is missing or incorrect. Go to Settings in the plugin UI and re-enter the token.

**"HTTP 503" / "Machine authentication not configured"**: Production env on Vercel is missing plugin/machine secrets. Contact Vince.

**HTTP 401 or "Expected JSON" / HTML body**: Often **Vercel Deployment Protection** or pointing the API base at the wrong host. Confirm the API base URL and Vercel protection settings.

**"Failed to fetch" / network errors**: Wrong API base, hostname not allowed in the plugin manifest, or the host is unreachable from Figma’s network.

**Plugin not appearing in Figma**: Make sure you're in the correct Figma organization. The plugin is published as an internal org plugin, not a public community plugin.

**API Base is wrong**: If you see requests going to `localhost`, the API base was not saved correctly. Re-enter the production URL and click Save. Note: `http://localhost` is not allowed for published plugins in Figma’s network manifest.

## Token rotation

If Vince tells you the plugin token has been rotated, go to **Settings** in the plugin UI and enter the new token. The old token will stop working immediately.

## Questions?

Contact Vince Buyssens directly.
