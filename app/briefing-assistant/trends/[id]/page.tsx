import { TrendDetailClient } from './TrendDetailClient'

export default async function TrendDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <TrendDetailClient trendId={id} />
}
