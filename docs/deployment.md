# Deployment and repo structure

## Web app (Vercel)

- **Deployment root**: repository root. Vercel builds from the root; the Next.js app lives at the root (`app/`, `components/`, `lib/`, etc.).
- **Build**: `npm run build` runs `tsc && next build`. The same command is used in CI and by Vercel when not overridden by `vercel.json` (Vercel may use `vercel.json` `buildCommand` if set).

## Figma plugin

- **Package boundary**: `packages/figma-plugin/`. The plugin is built and developed there; it does not affect the web app or Vercel.
- **Build from root**: `npm run build:plugin` (or `npm run watch:plugin` for watch mode). These delegate to the `heimdall-figma-plugin` workspace.

## Supabase

Heimdall uses a hosted Supabase project for data persistence, auth, and storage.

### Required environment variables

| Variable | Scope | Purpose |
|---|---|---|
| `SUPABASE_URL` | Server only | Service-role database access |
| `SUPABASE_SERVICE_KEY` | Server only | Service-role key (never expose client-side) |
| `NEXT_PUBLIC_SUPABASE_URL` | Client + server | Supabase project URL for auth |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client + server | Supabase anon key for auth |

Both URL variables **must** point to the same Supabase project. The `/api/setup` health check reports `supabaseUrlMismatch: true` if they diverge.

### Privileged access

Admin, ops, forecast, and feedback routes require the authenticated user's email to belong to an allowed domain. Set `HEIMDALL_ALLOWED_EMAIL_DOMAINS` (CSV) in the environment to control this. Defaults to `thoughtform.co,loopearplugs.com`.

### Migrations

Migrations live in `supabase/migrations/` and are numbered sequentially. Run them via the Supabase Dashboard SQL Editor or `supabase db push`. Key security migrations:

- `022_security_lockdown.sql` — RLS + service-role policies on all tables, storage hardening, RPC revocations
- `027_security_hardening_v2.sql` — narrows authenticated-read policies, adds FORCE RLS, fills policy gaps

### Scripts

Migration helper scripts in `scripts/` and `src/scripts/` require `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` from the environment. They no longer contain hardcoded project URLs.

## TypeScript and imports

- **Root typecheck**: The root `tsconfig.json` uses `moduleResolution: "NodeNext"` and includes `src/**/*.ts` and `lib/**/*.ts`. Relative ESM imports in those trees must use explicit `.js` extensions (e.g. `from './supabase.js'`).
- **Path aliases**: `@/` resolves to the repo root; when used for files under `lib/` or `src/`, use the `.js` extension in the import path where NodeNext resolution applies (e.g. `from '@/lib/evidenceClient.js'`).
