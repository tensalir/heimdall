export {
  getSourceMode,
  normalizedToRow,
  upsertNormalizedAds,
  syncViaApify,
  syncViaBrowser,
  syncViaApi,
  isApifyAvailable,
  isMetaAdLibraryAvailable,
} from './ingest.js'
export type { SourceMode, SupabaseDb, NormalizedMetaAd } from './ingest.js'

export {
  lazyMirrorPass,
  runThumbnailWarmup,
  handleWarmThumbnails,
  handleMirrorMedia,
  handlePromoteVideo,
  handleCleanupMedia,
} from './media.js'
