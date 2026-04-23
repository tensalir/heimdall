import { notFound } from 'next/navigation'
import { ProjectDetailPage } from '@/components/showcase/ProjectDetailPage'
import {
  getProjectBySlug,
  getProjectNeighbors,
  PROJECT_SLUGS,
} from '@/lib/showcase/projects'

export function generateStaticParams() {
  return PROJECT_SLUGS.map((slug) => ({ projectSlug: slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  const project = getProjectBySlug(projectSlug)
  if (!project) return { title: 'Project · Creative Technology at Loop' }
  return { title: `${project.name} · Creative Technology at Loop` }
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  const project = getProjectBySlug(projectSlug)
  const neighbors = getProjectNeighbors(projectSlug)
  if (!project || !neighbors) notFound()

  return (
    <ProjectDetailPage
      project={project}
      prev={neighbors.prev}
      next={neighbors.next}
    />
  )
}
