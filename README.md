# Heimdall

> Workflow bridge between Monday.com and Figma for Loop Earplugs. Moves briefings, summarises feedback, and fills the gaps between the tools the team already uses.

## Why this exists

Loop's design briefings live in Monday.com Docs. The design team works in Figma. Connecting the two was a manual copy-paste job: read the Monday Doc, find the right Figma file for the current month, create a page following the template format, paste the content. Error-prone at volume, and the volume keeps growing.

The initial ask was simple: can we move briefings from Monday into Figma automatically, following specific template formats? That took some figuring out. Monday stores structured data you can pull via their API, but Figma is an infinite canvas with a very different architecture. The Figma MCP is limited. Once I got briefing sync working, the creative strategists asked: can we also summarise feedback from different stakeholders about briefings and creatives? That led to a sheet-based review system (similar to what I built for translation review in Babylon) which could aggregate and structure feedback from multiple sources.

The larger pattern: these tools are not going away. Monday, Figma, Frontify all do their jobs. The gaps are in moving information between them and surfacing patterns across them. Heimdall fills those gaps.

## What it does

Pulls briefings from Monday.com via webhooks or manual queue, uses Claude to extract and map fields from unstructured Monday Docs, and syncs them into Figma as structured template pages via a Figma plugin. An admin dashboard provides queue visibility, job status, routing configuration, and system health.

## Key capabilities

**Monday webhook integration.** Automatic job creation when briefings are updated in Monday. Eligibility filters control which items get synced.

**Claude mapping agent.** AI-powered field extraction from Monday Docs. Briefings are unstructured documents; Claude parses them into the structured fields the Figma template expects.

**Figma plugin.** Syncs queued briefings to monthly Figma files. Idempotent page creation prevents duplicates. Routing map determines which batch maps to which file key.

**Admin dashboard.** Queue stats, recent jobs, system health, routing map editor, manual queueing for ad-hoc syncs.

**Feedback summarisation.** Sheet-based review surface for aggregating stakeholder feedback on briefings and creatives. Reuses the same sheet primitives built for translation review in Babylon.

## Architecture

| Layer | Stack |
|-------|-------|
| Frontend | Next.js (App Router), shadcn/ui |
| Backend | Next.js API Routes |
| Storage | Vercel KV (Redis) for job queue, settings, webhook logs |
| Auth | Supabase session (admin/ops), cookie-password (sheets/briefing-assistant) |
| AI | Claude (field mapping agent) |
| Integrations | Monday.com API, Figma Plugin API |
| Plugin | Figma plugin for canvas sync |

```
app/                    # Pages and API routes
  api/                  # Webhook handlers, queue, routing
  admin/                # Dashboard, jobs, queue, routing, settings
lib/
  kv.ts                 # Vercel KV persistence
components/
  ui/                   # Design system components
src/
  agents/               # Claude mapping agent
  domain/               # Briefing and routing logic
  integrations/         # Monday, Figma clients
  orchestration/        # createOrQueueFigmaPage
packages/
  figma-plugin/         # Figma plugin source
  design-system/        # Shared UI components
```

## Getting started

Prerequisites: Node.js 20.9+, Vercel account (for KV), Monday.com and Figma API access.

```bash
npm install
```

Configure your local project settings with the required Monday, Figma, Supabase, and Vercel KV credentials. See the repo's internal setup documentation for the full list of required fields.

```bash
npm run dev        # Next.js admin panel (port 3846)
```

For the Figma plugin, see `packages/figma-plugin/` (manifest and source).

Deployment: see [DEPLOYMENT.md](./DEPLOYMENT.md) for the Vercel guide.

## What comes next

Deeper integration with the briefing assistant (campaign angle generation feeding directly into briefing templates), expanded feedback workflows, and tighter Frontify sync for approved assets. The roadmap tracks what the team surfaces as friction, not a predetermined feature list.
