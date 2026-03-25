# Heimdall Deployment Guide

## Prerequisites

1. **Vercel Account**: https://vercel.com/signup
2. **Vercel CLI** (optional): `npm i -g vercel`

## Step 1: Create Vercel Project

### Option A: Via Web UI

1. Go to https://vercel.com/new
2. Import your Git repository
3. Vercel will auto-detect Next.js

### Option B: Via CLI

```bash
npm i -g vercel
vercel
```

Follow prompts to link the project.

## Step 2: Set Up Vercel KV

1. In Vercel dashboard, go to **Storage** tab
2. Click **Create Database** → **KV** (Redis)
3. Name it `heimdall-kv` (or any name)
4. Vercel will auto-set `KV_REST_API_URL` and `KV_REST_API_TOKEN` in your project

## Step 3: Configure Environment Variables

In Vercel Project Settings → Environment Variables, add:

### Monday.com
- `MONDAY_API_TOKEN` - Your Monday API token
- `MONDAY_SIGNING_SECRET` - Monday webhook signing secret
- `MONDAY_BOARD_ID` - Default board ID (9147622374)

### Figma
- `FIGMA_ACCESS_TOKEN` - Figma personal access token
- `FIGMA_TEMPLATE_FILE_KEY` - Template file key

### Claude
- `ANTHROPIC_API_KEY` - Anthropic API key for mapping agent
- `ANTHROPIC_THINKING_BUDGET` - (Optional) Token budget for extended thinking (default: 10000)

### Admin Auth
- `ADMIN_PASSWORD` - Password for basic auth (leave empty for dev mode)

### KV (Auto-set when you link KV)
- `KV_REST_API_URL` - Auto-set by Vercel KV
- `KV_REST_API_TOKEN` - Auto-set by Vercel KV

## Step 4: Deploy

```bash
git add .
git commit -m "Add Vercel deployment"
git push origin main
```

Vercel will auto-deploy on push. Or manually trigger:

```bash
vercel --prod
```

## Step 5: Register Monday Webhook

1. Get your Vercel deployment URL (e.g., `https://heimdall.vercel.app`)
2. Go to Monday.com board → Integrations → Webhooks
3. Create webhook:
   - URL: `https://heimdall.vercel.app/api/webhooks/monday`
   - Events: Item updated, Item created
   - Board: Select your Paid Social board

## Step 6: Initialize KV Settings

Since this is the first deployment, you need to initialize the routing map in KV:

1. Go to `https://heimdall.vercel.app/routing`
2. Add your batch → file key mappings (e.g., `2026-03` → `figmaFileKey...`)
3. Click Save

Or use the settings API:

```bash
curl -X PUT https://heimdall.vercel.app/api/settings \
  -H "Content-Type: application/json" \
  -d '{"routing": {"2026-03": "your-figma-file-key"}}'
```

## Step 7: Update Figma Plugin

Update the default API base URL in `figma-plugin/code.ts`:

```typescript
const savedBase = await figma.clientStorage.getAsync('apiBase')
const apiBase = savedBase || 'https://heimdall.vercel.app' // Update this line
```

Rebuild the plugin:

```bash
npm run build:plugin
```

Publish the updated plugin to your Figma organization.

## Step 8: Test the Integration

1. **Manual Queue Test**: Go to `/queue` and queue a test briefing
2. **Webhook Test**: Update a Monday item status to trigger webhook
3. **Figma Plugin Test**: Open monthly Figma file, run plugin, sync queued briefings

## Monitoring & Logs

- **Vercel Logs**: https://vercel.com/your-project/logs
- **Dashboard**: https://heimdall.vercel.app/
- **Jobs Page**: https://heimdall.vercel.app/jobs

## Rollback

If deployment fails, rollback via Vercel UI:

1. Go to Deployments tab
2. Find previous working deployment
3. Click three dots → Promote to Production

## Optional: Custom Domain

1. Vercel Project Settings → Domains
2. Add your custom domain (e.g., `heimdall.yourcompany.com`)
3. Update Monday webhook URL and Figma plugin URL to use custom domain

## Troubleshooting

### Jobs not appearing in dashboard
- Check KV is linked (Environment Variables should show `KV_REST_API_URL`)
- Verify Monday webhook is registered correctly
- Check Vercel logs for errors

### Monday webhook not triggering
- Verify `MONDAY_SIGNING_SECRET` is set correctly
- Check webhook URL is pointing to your Vercel deployment
- Test webhook manually via Monday UI

### Figma plugin cannot connect
- Ensure API routes allow CORS (already configured in route handlers)
- Verify plugin has correct API base URL (default: `https://bifrost-rose.vercel.app`, see `packages/figma-plugin/src/constants.ts`)
- Set `HEIMDALL_PLUGIN_SECRET` on Vercel and distribute the same value as the plugin token
- **Vercel Deployment Protection**: if enabled on the plugin’s API hostname, unauthenticated `fetch` from the plugin will get **401** or HTML error pages—allow `/api/*` for machine routes or use an unprotected production URL
- Check browser console for CORS errors

## Production Recommendations

1. **Enable Vercel Pro**: For Vercel Authentication (better than basic auth)
2. **Set up alerts**: Configure Vercel notifications for failed deployments
3. **Monitor KV usage**: Free tier has 30k requests/month
4. **Backup strategy**: KV data is persistent, but consider periodic exports via API
5. **Rate limiting**: Add rate limiting to webhook endpoint if needed

## Next Steps

Once deployed and verified:

1. ✅ Dashboard accessible at production URL
2. ✅ Monday webhook triggering jobs
3. ✅ Figma plugin syncing briefings
4. ✅ Routing map configured for all active months
5. ✅ Team trained on manual queue and monitoring

---

**Support**: For issues, check Vercel logs first, then consult the plan document.
