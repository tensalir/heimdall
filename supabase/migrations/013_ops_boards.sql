-- Ops Dashboard: board-level tracking for Monday → Figma briefing pipeline
-- Migration 013

-- ─── ops_boards ─────────────────────────────────────────────────────────────
-- Each row is a Monday board registered for pipeline tracking, mapped to a
-- Figma project (which may contain multiple monthly files).

create table ops_boards (
  id                  uuid primary key default gen_random_uuid(),
  monday_board_id     text not null unique,
  board_name          text not null
    constraint ops_boards_board_name_length check (char_length(board_name) between 1 and 255),
  figma_project_id    text
    constraint ops_boards_figma_project_id_format check (figma_project_id is null or char_length(figma_project_id) between 1 and 255),
  figma_project_name  text,
  description         text,
  auto_queue          boolean not null default true,
  eligible_statuses   text[] not null default '{"Brief ready / approved"}',
  last_board_sync_at  timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

alter table ops_boards enable row level security;
create policy "service_role_all_ops_boards" on ops_boards
  for all using (auth.role() = 'service_role');

-- ─── ops_board_items ────────────────────────────────────────────────────────
-- Every briefing item from tracked Monday boards with pipeline status.
-- Upserted on board sync and updated by webhooks / job callbacks.

create type pipeline_status_enum as enum (
  'new',        -- seen on Monday, not yet eligible
  'eligible',   -- Monday status matches eligible_statuses
  'queued',     -- enqueued in KV job queue
  'syncing',    -- Figma plugin currently processing
  'synced',     -- page created in Figma
  'failed',     -- sync attempt failed
  'skipped'     -- manually excluded
);

create table ops_board_items (
  id                uuid primary key default gen_random_uuid(),
  board_id          uuid not null references ops_boards(id) on delete cascade,
  monday_item_id    text not null,
  monday_board_id   text not null,
  item_name         text not null,
  experiment_name   text,
  batch_canonical   text,
  batch_raw         text,
  section_name      text,
  monday_status     text,
  pipeline_status   pipeline_status_enum not null default 'new',
  figma_file_key    text,
  figma_page_id     text,
  figma_page_url    text,
  monday_snapshot   jsonb,
  queued_at         timestamptz,
  synced_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique(monday_item_id, monday_board_id)
);

create index idx_ops_board_items_board_id on ops_board_items(board_id);
create index idx_ops_board_items_pipeline on ops_board_items(pipeline_status);
create index idx_ops_board_items_batch on ops_board_items(batch_canonical);

alter table ops_board_items enable row level security;
create policy "service_role_all_ops_board_items" on ops_board_items
  for all using (auth.role() = 'service_role');

-- ─── ops_webhook_events (replay protection) ─────────────────────────────────
-- Stores processed webhook event fingerprints to reject duplicates/replays.

create table ops_webhook_events (
  id            uuid primary key default gen_random_uuid(),
  fingerprint   text not null unique,
  received_at   timestamptz not null default now()
);

create index idx_ops_webhook_events_received on ops_webhook_events(received_at);

alter table ops_webhook_events enable row level security;
create policy "service_role_all_ops_webhook_events" on ops_webhook_events
  for all using (auth.role() = 'service_role');

-- ─── briefing_embeddings (pgvector, deferred pipeline) ──────────────────────

create table briefing_embeddings (
  id              uuid primary key default gen_random_uuid(),
  board_item_id   uuid not null references ops_board_items(id) on delete cascade,
  content_summary text not null,
  model_version   text not null default 'voyage-3',
  embedding       vector(1024),
  created_at      timestamptz not null default now()
);

create index idx_briefing_embeddings_board_item on briefing_embeddings(board_item_id);
create index idx_briefing_embeddings_vector
  on briefing_embeddings using hnsw (embedding vector_cosine_ops);

alter table briefing_embeddings enable row level security;
create policy "service_role_all_briefing_embeddings" on briefing_embeddings
  for all using (auth.role() = 'service_role');

-- ─── Aggregate view for dashboard cards ─────────────────────────────────────

create or replace view ops_board_summary as
select
  b.id,
  b.monday_board_id,
  b.board_name,
  b.figma_project_id,
  b.figma_project_name,
  b.auto_queue,
  b.last_board_sync_at,
  count(i.id)                                              as total_items,
  count(i.id) filter (where i.pipeline_status = 'new')     as new_count,
  count(i.id) filter (where i.pipeline_status = 'eligible') as eligible_count,
  count(i.id) filter (where i.pipeline_status = 'queued')  as queued_count,
  count(i.id) filter (where i.pipeline_status = 'syncing') as syncing_count,
  count(i.id) filter (where i.pipeline_status = 'synced')  as synced_count,
  count(i.id) filter (where i.pipeline_status = 'failed')  as failed_count,
  count(i.id) filter (where i.pipeline_status = 'skipped') as skipped_count
from ops_boards b
left join ops_board_items i on i.board_id = b.id
group by b.id;
