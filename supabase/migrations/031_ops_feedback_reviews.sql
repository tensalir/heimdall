-- Migration 031: Ops feedback review store
-- Per-item review state for the feedback workflow inside /ops boards.
-- Stores cached doc content, parsed feedback structure, AI-generated summaries,
-- user-edited drafts, and sync-to-Monday metadata.

create table if not exists ops_feedback_reviews (
  id                    uuid primary key default gen_random_uuid(),
  board_item_id         uuid not null references ops_board_items(id) on delete cascade,
  monday_item_id        text not null,
  monday_board_id       text not null,

  -- Cached Monday doc content
  briefing_doc_cache    text,
  feedback_doc_cache    text,
  feedback_doc_id       text,

  -- Parsed feedback structure (JSON: versions -> variations -> feedback text)
  parsed_feedback       jsonb not null default '{}',

  -- AI summary
  generated_summary     text,
  contradiction_note    text,
  summary_model         text,
  generated_at          timestamptz,

  -- User-editable draft (autosaved)
  summary_draft         text,
  draft_updated_at      timestamptz,

  -- Sync-to-Monday metadata
  synced_to_monday      boolean not null default false,
  synced_at             timestamptz,
  synced_summary        text,
  monday_status_set     text,

  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  unique(monday_item_id, monday_board_id)
);

create index idx_ops_feedback_reviews_board_item on ops_feedback_reviews(board_item_id);
create index idx_ops_feedback_reviews_monday on ops_feedback_reviews(monday_item_id, monday_board_id);

alter table ops_feedback_reviews enable row level security;
create policy "service_role_all_ops_feedback_reviews" on ops_feedback_reviews
  for all using (auth.role() = 'service_role');
