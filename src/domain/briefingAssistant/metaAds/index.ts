export {
  getSourceMode,
  normalizedToRow,
  upsertNormalizedAds,
  syncViaApify,
  syncViaBrowser,
  syncViaApi,
  syncViaSearchApi,
  isApifyAvailable,
  isMetaAdLibraryAvailable,
  isSearchApiAvailable,
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
