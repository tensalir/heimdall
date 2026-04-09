/**
 * Customer insights (interviews, surveys) evidence adapter.
 * Returns empty until a real insights API or ingestion pipeline is wired.
 */

import type { EvidenceSourceAdapter } from './types.js'
import type { EvidenceSnippet } from '../angleContext.js'
import type { EvidenceFilter } from './types.js'

const SOURCE_ID = 'customer_insights'

export const customerInsightsAdapter: EvidenceSourceAdapter = {
  sourceId: SOURCE_ID,

  async getEvidence(_filter: EvidenceFilter): Promise<EvidenceSnippet[]> {
    return []
  },
}
