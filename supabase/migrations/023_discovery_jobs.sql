-- Durable discovery job queue for background trend/social/meta discovery runs.
-- Replaces in-memory booleans and fire-and-forget patterns so the UI can
-- poll job status and survive navigation without losing progress.

create table if not exists briefing_discovery_jobs (
  id          uuid primary key default gen_random_uuid(),
  job_type    text not null check (job_type in (
    'trend_discovery', 'social_discovery', 'meta_watchlist_sync', 'meta_manual_sync'
  )),
  status      text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed'
  )),
  params      jsonb not null default '{}',
  progress    jsonb not null default '{}',
  error       text,
  created_at  timestamptz not null default now(),
  started_at  timestamptz,
  completed_at timestamptz,
  created_by  uuid references auth.users(id) on delete set null
);

create index if not exists idx_bdj_type_status on briefing_discovery_jobs(job_type, status);
create index if not exists idx_bdj_created on briefing_discovery_jobs(created_at desc);

alter table briefing_discovery_jobs enable row level security;
