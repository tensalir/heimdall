-- Create Ads / Briefing Assistant: persisted drafts (auto-save + resume via ?draft=)

create table if not exists briefing_drafts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  name              text not null default 'Untitled briefing',
  sections          jsonb not null default '{}',
  source_item_ids   text[] not null default '{}',
  asset_ids         text[] not null default '{}',
  monday_board_id   text,
  monday_status     text,
  monday_assignee   text,
  monday_item_id    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_briefing_drafts_user on briefing_drafts(user_id);
create index if not exists idx_briefing_drafts_updated on briefing_drafts(user_id, updated_at desc);

alter table briefing_drafts enable row level security;

create policy "Users select own briefing drafts"
  on briefing_drafts for select
  using (auth.uid() = user_id);

create policy "Users insert own briefing drafts"
  on briefing_drafts for insert
  with check (auth.uid() = user_id);

create policy "Users update own briefing drafts"
  on briefing_drafts for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users delete own briefing drafts"
  on briefing_drafts for delete
  using (auth.uid() = user_id);
