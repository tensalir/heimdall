-- User-created boards (collections) for saving ads.

create table if not exists user_ad_boards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique(user_id, name)
);

create index if not exists idx_uab_user on user_ad_boards(user_id);

alter table user_ad_boards enable row level security;

create policy "Users can view their own boards"
  on user_ad_boards for select
  using (auth.uid() = user_id);

create policy "Users can create boards"
  on user_ad_boards for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own boards"
  on user_ad_boards for update
  using (auth.uid() = user_id);

create policy "Users can delete their own boards"
  on user_ad_boards for delete
  using (auth.uid() = user_id);

-- Add optional board reference to saved items.
alter table briefing_saved_items
  add column if not exists board_id uuid references user_ad_boards(id) on delete set null;

create index if not exists idx_bsaved_board on briefing_saved_items(board_id);
