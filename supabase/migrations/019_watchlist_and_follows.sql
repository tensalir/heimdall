-- Backend-owned watchlist for default Meta library feeds.
-- Powers the Use Cases, Trending, and manual brand tabs.

create table if not exists meta_ads_watchlist (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  kind            text not null check (kind in ('use_case', 'trending_seed', 'manual_brand')),
  search_term     text,
  page_id         text,
  page_name       text,
  region_code     text not null default 'US',
  enabled         boolean not null default true,
  is_default      boolean not null default false,
  sort_mode       text not null default 'longest_running' check (sort_mode in ('longest_running', 'newest')),
  last_synced_at  timestamptz,
  last_success_at timestamptz,
  last_error      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_maw_kind on meta_ads_watchlist(kind);
create index if not exists idx_maw_enabled on meta_ads_watchlist(enabled) where enabled = true;

-- Seed default use-case watchlist entries for Loop Earplugs
insert into meta_ads_watchlist (name, kind, search_term, region_code, is_default, sort_mode) values
  ('Sleep',     'use_case',      'sleep earplugs',     'US', true, 'longest_running'),
  ('Focus',     'use_case',      'focus concentration', 'US', true, 'longest_running'),
  ('Lifestyle', 'use_case',      'noise cancelling lifestyle', 'US', true, 'longest_running'),
  ('Trending',  'trending_seed', 'best ads',           'US', true, 'longest_running')
on conflict do nothing;

-- Per-user followed brands (brand-level, not ad-level)
create table if not exists briefing_followed_brands (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  page_id     text not null,
  page_name   text not null default '',
  created_at  timestamptz not null default now(),
  unique(user_id, page_id)
);

create index if not exists idx_bfb_user on briefing_followed_brands(user_id);
create index if not exists idx_bfb_page on briefing_followed_brands(page_id);

alter table briefing_followed_brands enable row level security;

create policy "Users can view their own followed brands"
  on briefing_followed_brands for select
  using (auth.uid() = user_id);

create policy "Users can follow brands"
  on briefing_followed_brands for insert
  with check (auth.uid() = user_id);

create policy "Users can unfollow brands"
  on briefing_followed_brands for delete
  using (auth.uid() = user_id);

-- Source attribution on briefing_source_items
alter table briefing_source_items
  add column if not exists page_id text,
  add column if not exists source_query text,
  add column if not exists watchlist_id uuid references meta_ads_watchlist(id) on delete set null;

create index if not exists idx_bsi_page_id on briefing_source_items(page_id) where page_id is not null;

-- RLS: service_role only for watchlist
alter table meta_ads_watchlist enable row level security;
