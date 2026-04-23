import type { ProjectStatus, ProjectStatusTag } from '@/lib/showcase/projects'

export function StatusTag({
  status,
  statusTag,
}: {
  status: ProjectStatus
  statusTag: ProjectStatusTag
}) {
  return (
    <span className={'tag ' + (statusTag === 'prod' ? 'tag--prod' : 'tag--wip')}>
      {status === 'PRODUCTION' ? '● Production' : '◐ Work in progress'}
    </span>
  )
}
