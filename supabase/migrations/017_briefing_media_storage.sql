-- Supabase Storage bucket for mirrored Meta ad media assets.
-- Run this via the Supabase dashboard SQL editor or migration tooling.
-- If the bucket already exists, the insert is a no-op.

insert into storage.buckets (id, name, public)
values ('briefing-media', 'briefing-media', true)
on conflict (id) do nothing;

-- Allow public reads (images/videos served directly to the gallery).
create policy "Public read access on briefing-media"
  on storage.objects for select
  using (bucket_id = 'briefing-media');

-- Allow service-role uploads (server-side mirror worker).
create policy "Service role upload on briefing-media"
  on storage.objects for insert
  with check (bucket_id = 'briefing-media');

-- Allow service-role overwrite (upsert on re-warm).
create policy "Service role update on briefing-media"
  on storage.objects for update
  using (bucket_id = 'briefing-media');
