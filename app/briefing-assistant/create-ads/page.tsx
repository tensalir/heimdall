import { CreateAdsClient } from './CreateAdsClient'

export default async function CreateAdsPage({
  searchParams,
}: {
  searchParams: Promise<{ source?: string; sourceId?: string }>
}) {
  const resolved = await searchParams
  return (
    <CreateAdsClient
      initialSource={resolved.source ?? null}
      initialSourceId={resolved.sourceId ?? null}
    />
  )
}
