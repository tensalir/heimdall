-- Need-state dimension for ad discovery.
-- Adds need_state to both briefing_source_items and meta_ads_watchlist,
-- replaces the original watchlist seeds with need-state-aligned queries,
-- and purges ads ingested via the retired noisy seeds.

-- 1. Add need_state column to briefing_source_items
alter table briefing_source_items
  add column if not exists need_state text
    check (need_state is null or need_state in (
      'sleep', 'focus', 'sensory', 'festivals', 'parenting', 'travel', 'wellness'
    ));

create index if not exists idx_bsi_need_state
  on briefing_source_items(need_state)
  where need_state is not null;

-- 2. Add need_state column to meta_ads_watchlist
alter table meta_ads_watchlist
  add column if not exists need_state text
    check (need_state is null or need_state in (
      'sleep', 'focus', 'sensory', 'festivals', 'parenting', 'travel', 'wellness'
    ));

-- 3. Purge ads from the noisy default seeds before removing the watchlist rows.
--    Delete ads whose watchlist_id points to the "Lifestyle" or "Trending" defaults
--    (search_term = 'noise cancelling lifestyle' or 'best ads').
delete from briefing_source_items
  where watchlist_id in (
    select id from meta_ads_watchlist
    where is_default = true
      and search_term in ('noise cancelling lifestyle', 'best ads')
  );

-- 4. Remove all original default watchlist entries so we can re-seed cleanly.
delete from meta_ads_watchlist where is_default = true;

-- 5. Insert new need-state-aligned watchlist seeds.
insert into meta_ads_watchlist (name, kind, search_term, region_code, is_default, sort_mode, need_state) values
  ('Sleep',     'use_case', 'earplugs sleep snoring',       'US', true, 'longest_running', 'sleep'),
  ('Focus',     'use_case', 'noise reduction office focus',  'US', true, 'longest_running', 'focus'),
  ('Sensory',   'use_case', 'sensory overload earplugs',    'US', true, 'longest_running', 'sensory'),
  ('Festivals', 'use_case', 'hearing protection concert',   'US', true, 'longest_running', 'festivals'),
  ('Parenting', 'use_case', 'baby hearing protection',      'US', true, 'longest_running', 'parenting'),
  ('Travel',    'use_case', 'noise blocking travel sleep',  'US', true, 'longest_running', 'travel')
on conflict do nothing;
