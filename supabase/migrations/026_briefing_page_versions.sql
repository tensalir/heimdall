-- Append-only page version history for plugin writes.
-- Every mutation of a briefing page captures a pre/post snapshot so
-- any change can be browsed or restored.

-- 1. Main version history table
create table if not exists briefing_page_versions (
  id                  uuid primary key default gen_random_uuid(),
  sync_id             uuid references briefing_syncs(id) on delete set null,
  monday_item_id      text not null,
  monday_board_id     text not null,
  batch_canonical     text,
  figma_file_key      text not null,
  figma_page_id       text,
  figma_page_name     text,
  version_number      int not null default 1,
  capture_phase       text not null check (capture_phase in (
    'pre_write', 'post_write', 'post_restore', 'backfill'
  )),
  operation_kind      text not null check (operation_kind in (
    'create', 'update', 'restore', 'repair_backfill', 'template_create',
    'layout_fix', 'widget_migrate', 'image_import'
  )),
  source              text not null check (source in (
    'plugin_sync', 'webhook', 'manual_queue', 'admin_restore', 'admin_backfill'
  )),
  idempotency_key     text,
  page_snapshot       jsonb not null default '{}',
  input_snapshot      jsonb not null default '{}',
  monday_snapshot     jsonb not null default '{}',
  write_metadata      jsonb not null default '{}',
  page_hash           text,
  prior_version_id    uuid references briefing_page_versions(id) on delete set null,
  restored_from_version_id uuid references briefing_page_versions(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index if not exists idx_bpv_sync_id on briefing_page_versions(sync_id, version_number desc);
create index if not exists idx_bpv_figma_page on briefing_page_versions(figma_file_key, figma_page_id, created_at desc);
create index if not exists idx_bpv_monday_item on briefing_page_versions(monday_item_id, figma_file_key);
create index if not exists idx_bpv_created on briefing_page_versions(created_at desc);

alter table briefing_page_versions enable row level security;
create policy "service_role_all_bpv" on briefing_page_versions
  for all using (auth.role() = 'service_role');

-- 2. Restore run tracking (operator-initiated)
create table if not exists briefing_restore_runs (
  id                  uuid primary key default gen_random_uuid(),
  requested_by        uuid references auth.users(id) on delete set null,
  request_source      text not null default 'admin',
  selection_mode      text not null check (selection_mode in (
    'single_version', 'page_point_in_time', 'file_point_in_time'
  )),
  figma_file_key      text,
  figma_file_name     text,
  requested_restore_to timestamptz,
  status              text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed', 'partial'
  )),
  params              jsonb not null default '{}',
  result_summary      jsonb not null default '{}',
  error               text,
  requested_at        timestamptz not null default now(),
  started_at          timestamptz,
  completed_at        timestamptz
);

create index if not exists idx_brr_status on briefing_restore_runs(status);
create index if not exists idx_brr_requested on briefing_restore_runs(requested_at desc);

alter table briefing_restore_runs enable row level security;
create policy "service_role_all_brr" on briefing_restore_runs
  for all using (auth.role() = 'service_role');

-- 3. Per-page items within a restore run
create table if not exists briefing_restore_items (
  id                  uuid primary key default gen_random_uuid(),
  restore_run_id      uuid not null references briefing_restore_runs(id) on delete cascade,
  sync_id             uuid references briefing_syncs(id) on delete set null,
  target_version_id   uuid not null references briefing_page_versions(id) on delete restrict,
  monday_item_id      text not null,
  figma_file_key      text not null,
  figma_page_id       text,
  figma_page_name     text,
  restore_mode        text not null default 'restore_copy' check (restore_mode in (
    'restore_copy', 'in_place'
  )),
  status              text not null default 'queued' check (status in (
    'queued', 'running', 'completed', 'failed', 'skipped'
  )),
  result_version_id   uuid references briefing_page_versions(id) on delete set null,
  result_page_id      text,
  error_code          text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);

create index if not exists idx_bri_run on briefing_restore_items(restore_run_id);
create index if not exists idx_bri_target on briefing_restore_items(target_version_id);

alter table briefing_restore_items enable row level security;
create policy "service_role_all_bri" on briefing_restore_items
  for all using (auth.role() = 'service_role');

-- 4. Extend briefing_syncs with current-version pointers
alter table briefing_syncs
  add column if not exists current_version_id uuid references briefing_page_versions(id) on delete set null,
  add column if not exists last_restored_at timestamptz,
  add column if not exists last_restored_from_version_id uuid references briefing_page_versions(id) on delete set null;
