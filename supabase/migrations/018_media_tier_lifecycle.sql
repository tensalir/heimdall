-- Media lifecycle columns for Atria-style tiered storage.
-- Poster images are mirrored for all competitor ads;
-- full videos are promoted only for the hot set.

alter table briefing_source_items
  add column if not exists media_tier text not null default 'poster_only'
    check (media_tier in ('poster_only', 'video_promoted', 'first_party')),
  add column if not exists source_video_url text,
  add column if not exists video_status text not null default 'none'
    check (video_status in ('none', 'detected', 'promoted', 'mirrored')),
  add column if not exists last_viewed_at timestamptz,
  add column if not exists last_played_at timestamptz,
  add column if not exists media_mirrored_at timestamptz;

create index if not exists idx_bsi_media_tier
  on briefing_source_items(media_tier);

create index if not exists idx_bsi_video_status
  on briefing_source_items(video_status)
  where video_status != 'none';

create index if not exists idx_bsi_last_viewed
  on briefing_source_items(last_viewed_at desc nulls last)
  where last_viewed_at is not null;
