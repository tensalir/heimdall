-- Migration 014: Add creative_partner to ops_board_items,
-- default_creative_partners to ops_boards, and update summary view
-- to use workflow-based counts instead of pipeline-status counts.

-- ─── New columns ────────────────────────────────────────────────────────────

alter table ops_board_items
  add column if not exists creative_partner text;

create index idx_ops_board_items_creative_partner
  on ops_board_items(creative_partner);

alter table ops_boards
  add column if not exists default_creative_partners text[]
    not null default '{"Studio"}';

-- ─── Replace summary view with workflow-based counts ────────────────────────

drop view if exists ops_board_summary;

create view ops_board_summary as
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
  -- Workflow lane counts
  count(i.id) filter (where lower(trim(i.monday_status)) = 'brief wip')
    as upcoming_count,
  count(i.id) filter (where lower(trim(i.monday_status)) = 'brief ready / approved'
                        and i.pipeline_status not in ('synced', 'queued', 'syncing'))
    as ready_for_figma_count,
  count(i.id) filter (where i.pipeline_status in ('synced', 'queued', 'syncing'))
    as imported_count,
  count(i.id) filter (where lower(trim(i.monday_status)) = 'exported to frontify')
    as exported_count,
  -- Technical status counts (kept for observability)
  count(i.id) filter (where i.pipeline_status = 'queued')  as queued_count,
  count(i.id) filter (where i.pipeline_status = 'syncing') as syncing_count,
  count(i.id) filter (where i.pipeline_status = 'failed')  as failed_count,
  count(i.id) filter (where i.pipeline_status = 'synced')  as synced_count
from ops_boards b
left join ops_board_items i on i.board_id = b.id
group by b.id;
