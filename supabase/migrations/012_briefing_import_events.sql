-- Full import-attempt audit: one row per attempt (queued, skipped_already_imported, completed, failed).
-- Used for dedupe (skip already-imported) and diagnostics.
create table if not exists briefing_import_events (
  id                uuid primary key default gen_random_uuid(),
  monday_item_id    text not null,
  monday_board_id   text not null,
  monday_item_name  text not null,
  batch_canonical   text not null,
  figma_file_key    text not null,
  figma_page_id     text,
  figma_page_name   text,
  idempotency_key   text,
  source            text not null check (source in ('plugin_sync', 'webhook', 'manual_queue')),
  outcome           text not null check (outcome in ('queued', 'skipped_already_imported', 'completed', 'failed')),
  reason            text,
  error_code        text,
  created_at        timestamptz not null default now()
);

create index if not exists idx_briefing_import_events_monday_item on briefing_import_events(monday_item_id);
create index if not exists idx_briefing_import_events_figma_file on briefing_import_events(figma_file_key);
create index if not exists idx_briefing_import_events_idempotency on briefing_import_events(idempotency_key);
create index if not exists idx_briefing_import_events_created_at on briefing_import_events(created_at desc);
