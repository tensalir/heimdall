import { MetaAdDetailClient } from './MetaAdDetailClient'

export default async function MetaAdDetailPage({
  params,
}: {
  params: Promise<{ adId: string }>
}) {
  const { adId } = await params
  return <MetaAdDetailClient adId={adId} />
}
