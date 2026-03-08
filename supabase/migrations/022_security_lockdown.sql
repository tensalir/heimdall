-- Migration 022: Comprehensive security lockdown.
-- Adds RLS and service-role-only policies to all proprietary tables that
-- previously had none, hardens storage policies, restricts RPCs, and
-- secures the ops_board_summary view.

-- ============================================================
-- 1) Enable RLS + service-role-only on tables that had NONE
-- ============================================================

-- Comments subsystem (001_comments.sql)
alter table comment_files enable row level security;
create policy "service_role_all_comment_files" on comment_files
  for all using (auth.role() = 'service_role');

alter table comments enable row level security;
create policy "service_role_all_comments" on comments
  for all using (auth.role() = 'service_role');

alter table comment_summaries enable row level security;
create policy "service_role_all_comment_summaries" on comment_summaries
  for all using (auth.role() = 'service_role');

-- Feedback subsystem (003_feedback.sql)
alter table feedback_rounds enable row level security;
create policy "service_role_all_feedback_rounds" on feedback_rounds
  for all using (auth.role() = 'service_role');

alter table feedback_experiments enable row level security;
create policy "service_role_all_feedback_experiments" on feedback_experiments
  for all using (auth.role() = 'service_role');

alter table feedback_entries enable row level security;
create policy "service_role_all_feedback_entries" on feedback_entries
  for all using (auth.role() = 'service_role');

-- Briefing sprints subsystem (004_briefing_sprints.sql)
alter table briefing_sprints enable row level security;
create policy "service_role_all_briefing_sprints" on briefing_sprints
  for all using (auth.role() = 'service_role');

alter table briefing_sprint_batches enable row level security;
create policy "service_role_all_briefing_sprint_batches" on briefing_sprint_batches
  for all using (auth.role() = 'service_role');

alter table briefing_assignments enable row level security;
create policy "service_role_all_briefing_assignments" on briefing_assignments
  for all using (auth.role() = 'service_role');

-- Briefing syncs (008_briefing_syncs.sql)
alter table briefing_syncs enable row level security;
create policy "service_role_all_briefing_syncs" on briefing_syncs
  for all using (auth.role() = 'service_role');

-- Forecast subsystem (010_forecast.sql, 011_forecast_full.sql)
alter table forecast_runs enable row level security;
create policy "service_role_all_forecast_runs" on forecast_runs
  for all using (auth.role() = 'service_role');

alter table forecast_use_case_rows enable row level security;
create policy "service_role_all_forecast_use_case_rows" on forecast_use_case_rows
  for all using (auth.role() = 'service_role');

alter table forecast_fc_overrides enable row level security;
create policy "service_role_all_forecast_fc_overrides" on forecast_fc_overrides
  for all using (auth.role() = 'service_role');

alter table forecast_cs_overrides enable row level security;
create policy "service_role_all_forecast_cs_overrides" on forecast_cs_overrides
  for all using (auth.role() = 'service_role');

alter table forecast_cs_detail_rows enable row level security;
create policy "service_role_all_forecast_cs_detail_rows" on forecast_cs_detail_rows
  for all using (auth.role() = 'service_role');

-- Import events (012_briefing_import_events.sql)
alter table briefing_import_events enable row level security;
create policy "service_role_all_briefing_import_events" on briefing_import_events
  for all using (auth.role() = 'service_role');

-- ============================================================
-- 2) Add explicit service-role-only policies to tables that
--    had RLS enabled but NO policies (empty = deny all, but
--    explicit is safer and clearer)
-- ============================================================

-- briefing_source_items (015_briefing_source_items.sql)
create policy "service_role_all_briefing_source_items" on briefing_source_items
  for all using (auth.role() = 'service_role');

create policy "service_role_all_briefing_analysis_scores" on briefing_analysis_scores
  for all using (auth.role() = 'service_role');

create policy "service_role_all_briefing_generated_assets" on briefing_generated_assets
  for all using (auth.role() = 'service_role');

create policy "service_role_all_briefing_workflow_runs" on briefing_workflow_runs
  for all using (auth.role() = 'service_role');

-- evidence RAG (009_evidence_rag.sql)
create policy "service_role_all_evidence_datasets" on evidence_datasets
  for all using (auth.role() = 'service_role');

create policy "service_role_all_evidence_chunks" on evidence_chunks
  for all using (auth.role() = 'service_role');

create policy "service_role_all_evidence_ingestion_runs" on evidence_ingestion_runs
  for all using (auth.role() = 'service_role');

-- Meta intelligence (020_meta_intelligence.sql)
create policy "service_role_all_ad_creative_embeddings" on ad_creative_embeddings
  for all using (auth.role() = 'service_role');

create policy "service_role_all_ad_graph_nodes" on ad_graph_nodes
  for all using (auth.role() = 'service_role');

create policy "service_role_all_ad_graph_edges" on ad_graph_edges
  for all using (auth.role() = 'service_role');

-- Watchlist (019_watchlist_and_follows.sql)
create policy "service_role_all_meta_ads_watchlist" on meta_ads_watchlist
  for all using (auth.role() = 'service_role');

-- Also allow authenticated users to read source items for browse
-- (they cannot write; writing is service-role only via separate policy above)
create policy "authenticated_read_briefing_source_items" on briefing_source_items
  for select using (auth.role() = 'authenticated');

create policy "authenticated_read_briefing_analysis_scores" on briefing_analysis_scores
  for select using (auth.role() = 'authenticated');

-- ============================================================
-- 3) Lock down storage: make briefing-media private
-- ============================================================

-- Remove the overly broad public read and unscoped write policies
drop policy if exists "Public read access on briefing-media" on storage.objects;
drop policy if exists "Service role upload on briefing-media" on storage.objects;
drop policy if exists "Service role update on briefing-media" on storage.objects;

-- Make the bucket private
update storage.buckets
  set public = false
  where id = 'briefing-media';

-- Authenticated users can read media (served through signed URLs or auth proxy)
create policy "Authenticated read on briefing-media"
  on storage.objects for select
  using (bucket_id = 'briefing-media' and auth.role() in ('authenticated', 'service_role'));

-- Only service role can upload/update
create policy "Service role insert on briefing-media"
  on storage.objects for insert
  with check (bucket_id = 'briefing-media' and auth.role() = 'service_role');

create policy "Service role update on briefing-media"
  on storage.objects for update
  using (bucket_id = 'briefing-media' and auth.role() = 'service_role');

create policy "Service role delete on briefing-media"
  on storage.objects for delete
  using (bucket_id = 'briefing-media' and auth.role() = 'service_role');

-- ============================================================
-- 4) Harden RPCs: revoke public execute on SECURITY DEFINER fns
-- ============================================================

revoke execute on function match_evidence_chunks from public;
revoke execute on function match_evidence_chunks from anon;
revoke execute on function match_evidence_chunks from authenticated;

revoke execute on function match_ad_creatives from public;
revoke execute on function match_ad_creatives from anon;
revoke execute on function match_ad_creatives from authenticated;

-- ============================================================
-- 5) Harden ops_board_summary view with security_invoker
-- ============================================================

drop view if exists ops_board_summary;

create view ops_board_summary
  with (security_invoker = true)
as
select
  b.id,
  b.monday_board_id,
  b.board_name,
  b.figma_project_id,
  b.figma_project_name,
  b.auto_queue,
  b.default_creative_partners,
  b.last_board_sync_at,
  count(i.id)                                              as total_items,
  count(i.id) filter (where lower(trim(i.monday_status)) = 'brief wip')
    as upcoming_count,
  count(i.id) filter (where lower(trim(i.monday_status)) = 'brief ready / approved'
                        and i.pipeline_status not in ('synced', 'queued', 'syncing'))
    as ready_for_figma_count,
  count(i.id) filter (where i.pipeline_status in ('synced', 'queued', 'syncing'))
    as imported_count,
  count(i.id) filter (where lower(trim(i.monday_status)) = 'exported to frontify')
    as exported_count,
  count(i.id) filter (where i.pipeline_status = 'queued')  as queued_count,
  count(i.id) filter (where i.pipeline_status = 'syncing') as syncing_count,
  count(i.id) filter (where i.pipeline_status = 'failed')  as failed_count,
  count(i.id) filter (where i.pipeline_status = 'synced')  as synced_count
from ops_boards b
left join ops_board_items i on i.board_id = b.id
group by b.id;
