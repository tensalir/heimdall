-- Briefing Assistant v2: normalized source items (ads, trends, comments, workflow outputs)
-- and AI analysis scores for creative evaluation.

create table if not exists briefing_source_items (
  id                uuid primary key default gen_random_uuid(),
  source_type       text not null check (source_type in ('meta_ad', 'trend', 'social_comment', 'workflow_output', 'manual')),
  external_id       text,
  title             text not null,
  preview           text,
  thumbnail_url     text,
  creative_url      text,
  body_text         text,
  link_url          text,
  media_type        text check (media_type in ('image', 'video', 'text', 'carousel')),
  platform          text,
  page_name         text,
  is_active         boolean not null default false,
  started_at        timestamptz,
  ended_at          timestamptz,
  spend_lower       numeric,
  spend_upper       numeric,
  impressions_lower bigint,
  impressions_upper bigint,
  tags              text[] not null default '{}',
  raw_data          jsonb not null default '{}',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(source_type, external_id)
);

create index if not exists idx_bsi_source_type on briefing_source_items(source_type);
create index if not exists idx_bsi_platform on briefing_source_items(platform);
create index if not exists idx_bsi_page_name on briefing_source_items(page_name);
create index if not exists idx_bsi_created on briefing_source_items(created_at desc);
create index if not exists idx_bsi_active on briefing_source_items(is_active) where is_active = true;

-- AI analysis scores per source item
create table if not exists briefing_analysis_scores (
  id                uuid primary key default gen_random_uuid(),
  source_item_id    uuid not null references briefing_source_items(id) on delete cascade,
  score_hook        smallint check (score_hook between 0 and 100),
  score_attention   smallint check (score_attention between 0 and 100),
  score_clarity     smallint check (score_clarity between 0 and 100),
  score_cta         smallint check (score_cta between 0 and 100),
  score_overall     smallint check (score_overall between 0 and 100),
  analysis_summary  text,
  rubric_version    text not null default 'v1',
  model_used        text,
  raw_response      jsonb,
  created_at        timestamptz not null default now(),
  unique(source_item_id, rubric_version)
);

create index if not exists idx_bas_source_item on briefing_analysis_scores(source_item_id);

-- Generated assets from Create Ads workflow
create table if not exists briefing_generated_assets (
  id                uuid primary key default gen_random_uuid(),
  source_item_id    uuid references briefing_source_items(id) on delete set null,
  prompt            text not null,
  image_url         text,
  status            text not null default 'generating' check (status in ('generating', 'completed', 'failed')),
  model             text not null,
  briefing_sections jsonb not null default '{}',
  vesper_generation_id text,
  error             text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_bga_source on briefing_generated_assets(source_item_id);
create index if not exists idx_bga_status on briefing_generated_assets(status);

-- Workflow runs
create table if not exists briefing_workflow_runs (
  id                uuid primary key default gen_random_uuid(),
  workflow_id       text not null,
  workflow_name     text not null,
  status            text not null default 'idle' check (status in ('idle', 'running', 'completed', 'failed')),
  started_at        timestamptz not null default now(),
  completed_at      timestamptz,
  output_count      int not null default 0,
  error             text,
  config            jsonb not null default '{}',
  created_at        timestamptz not null default now()
);

create index if not exists idx_bwr_workflow on briefing_workflow_runs(workflow_id);
create index if not exists idx_bwr_status on briefing_workflow_runs(status);

-- RLS: service_role only (server-side access)
alter table briefing_source_items enable row level security;
alter table briefing_analysis_scores enable row level security;
alter table briefing_generated_assets enable row level security;
alter table briefing_workflow_runs enable row level security;
