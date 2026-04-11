-- Iterator: durable job tracking and generated asset storage
-- Following the pattern from 023_discovery_jobs.sql

-- Iterator jobs table
create table if not exists iterator_jobs (
  id uuid primary key default gen_random_uuid(),
  mode text not null check (mode in ('layered-iteration', 'ai-bg-plus-layers', 'flat-ai-variants', 'briefing-to-ad')),
  status text not null default 'queued' check (status in ('queued', 'planning', 'generating', 'assembling', 'reviewing', 'completed', 'failed')),
  source_frame_id text,
  source_file_key text,
  briefing text,
  edit_plan jsonb,
  progress jsonb not null default '{}',
  error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

-- Generated assets produced by Iterator
create table if not exists iterator_generated_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references iterator_jobs(id) on delete cascade,
  asset_type text not null check (asset_type in ('flat-variant', 'background', 'assembled-frame')),
  aspect_ratio text not null,
  image_url text not null,
  prompt text,
  model text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Reference assets used as input for Iterator jobs
create table if not exists iterator_reference_assets (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references iterator_jobs(id) on delete cascade,
  source_type text not null check (source_type in ('figma-frame', 'uploaded-image', 'extracted-background')),
  source_id text,
  image_url text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Indexes for common queries
create index if not exists idx_iterator_jobs_status on iterator_jobs(status);
create index if not exists idx_iterator_jobs_mode on iterator_jobs(mode);
create index if not exists idx_iterator_generated_assets_job on iterator_generated_assets(job_id);
create index if not exists idx_iterator_reference_assets_job on iterator_reference_assets(job_id);

-- RLS policies (restrictive by default)
alter table iterator_jobs enable row level security;
alter table iterator_generated_assets enable row level security;
alter table iterator_reference_assets enable row level security;

-- Service role can do everything (backend routes use service role)
create policy "service_role_iterator_jobs" on iterator_jobs
  for all using (auth.role() = 'service_role');

create policy "service_role_iterator_generated_assets" on iterator_generated_assets
  for all using (auth.role() = 'service_role');

create policy "service_role_iterator_reference_assets" on iterator_reference_assets
  for all using (auth.role() = 'service_role');

-- Authenticated users can read their own jobs
create policy "users_read_own_iterator_jobs" on iterator_jobs
  for select using (auth.uid() = created_by);
