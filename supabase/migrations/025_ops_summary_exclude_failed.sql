-- Align ops_board_summary ready_for_figma_count to exclude failed/skipped items.
-- Previously only synced/queued/syncing were excluded, so a failed item whose
-- Monday status was still "Brief ready / approved" inflated the ready count.

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
                        and i.pipeline_status not in ('synced', 'queued', 'syncing', 'failed', 'skipped'))
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
