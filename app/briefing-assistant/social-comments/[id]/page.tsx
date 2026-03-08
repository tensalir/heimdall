import { SocialPostDetailClient } from './SocialPostDetailClient'

export default async function SocialPostDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <SocialPostDetailClient postId={id} />
}
