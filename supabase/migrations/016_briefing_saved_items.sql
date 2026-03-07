-- Per-user saved/bookmarked source items for Briefing Assistant
-- Powers the Following tab in Meta Ads Library

create table if not exists briefing_saved_items (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  source_item_id    uuid not null references briefing_source_items(id) on delete cascade,
  created_at        timestamptz not null default now(),
  unique(user_id, source_item_id)
);

create index if not exists idx_bsaved_user on briefing_saved_items(user_id);
create index if not exists idx_bsaved_source on briefing_saved_items(source_item_id);

alter table briefing_saved_items enable row level security;

create policy "Users can view their own saved items"
  on briefing_saved_items for select
  using (auth.uid() = user_id);

create policy "Users can save items"
  on briefing_saved_items for insert
  with check (auth.uid() = user_id);

create policy "Users can unsave items"
  on briefing_saved_items for delete
  using (auth.uid() = user_id);
