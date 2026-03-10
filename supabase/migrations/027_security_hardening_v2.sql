-- Migration 027: Security hardening v2.
-- Narrows over-broad authenticated-read policies, adds FORCE RLS to
-- sensitive tables, and fills policy gaps from earlier migrations.

-- ============================================================
-- 1) Narrow briefing_source_items and briefing_analysis_scores
--    from any-authenticated-read to service-role-only.
--    The app's browse routes use the service-role client, so
--    frontend-initiated queries never hit these tables directly.
-- ============================================================

drop policy if exists "authenticated_read_briefing_source_items" on briefing_source_items;
drop policy if exists "authenticated_read_briefing_analysis_scores" on briefing_analysis_scores;

-- ============================================================
-- 2) Narrow storage: briefing-media from authenticated-read
--    to service-role-only. Media is served via signed URLs or
--    the /api/briefing-assistant/meta-ads/[adId]/preview proxy.
-- ============================================================

drop policy if exists "Authenticated read on briefing-media" on storage.objects;

create policy "Service role read on briefing-media"
  on storage.objects for select
  using (bucket_id = 'briefing-media' and auth.role() = 'service_role');

-- ============================================================
-- 3) FORCE ROW LEVEL SECURITY on sensitive tables.
--    Prevents owner/superuser bypass as defense-in-depth.
-- ============================================================

alter table briefing_source_items force row level security;
alter table briefing_analysis_scores force row level security;
alter table briefing_generated_assets force row level security;
alter table briefing_workflow_runs force row level security;
alter table evidence_datasets force row level security;
alter table evidence_chunks force row level security;
alter table ad_creative_embeddings force row level security;
alter table ad_graph_nodes force row level security;
alter table ad_graph_edges force row level security;
alter table briefing_saved_items force row level security;
alter table user_ad_boards force row level security;
alter table pinned_projects force row level security;
alter table briefing_followed_brands force row level security;
alter table meta_ads_watchlist force row level security;
alter table ops_boards force row level security;
alter table ops_board_items force row level security;
alter table briefing_page_versions force row level security;
alter table briefing_restore_runs force row level security;
alter table briefing_restore_items force row level security;

-- ============================================================
-- 4) Add missing service-role policy to briefing_discovery_jobs.
--    RLS was enabled in 023 with no policies (deny-all by default),
--    but an explicit policy documents intent and allows service-role
--    access cleanly.
-- ============================================================

create policy "service_role_all_briefing_discovery_jobs" on briefing_discovery_jobs
  for all using (auth.role() = 'service_role');
