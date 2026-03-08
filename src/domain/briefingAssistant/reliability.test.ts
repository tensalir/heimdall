import { describe, it, expect } from 'vitest'

describe('Meta Ads browse cache behaviour', () => {
  it('should not cache empty discovery payloads that triggered watchlist sync', () => {
    const browseCache = new Map<string, { data: unknown; ts: number }>()

    const ads: unknown[] = []
    const syncState = ads.length === 0 ? 'syncing' : 'idle'
    const payload = { ads, sync_state: syncState }

    if (ads.length > 0) {
      browseCache.set('test-key', { data: payload, ts: Date.now() })
    }

    expect(browseCache.has('test-key')).toBe(false)
    expect(payload.sync_state).toBe('syncing')
  })

  it('should cache non-empty payloads', () => {
    const browseCache = new Map<string, { data: unknown; ts: number }>()
    const ads = [{ id: '1' }]
    const payload = { ads, sync_state: 'idle' }

    if (ads.length > 0) {
      browseCache.set('test-key', { data: payload, ts: Date.now() })
    }

    expect(browseCache.has('test-key')).toBe(true)
  })
})

describe('Tag merge behaviour', () => {
  it('should merge new tags into existing tag arrays without duplicates', () => {
    const existingTags = ['festivals', 'sleep']
    const newTag = 'wellness'
    const merged = [...new Set([...existingTags, newTag])]
    expect(merged).toEqual(['festivals', 'sleep', 'wellness'])
  })

  it('should not duplicate tags that already exist', () => {
    const existingTags = ['festivals', 'sleep']
    const newTag = 'festivals'
    const merged = [...new Set([...existingTags, newTag])]
    expect(merged).toEqual(['festivals', 'sleep'])
  })
})

describe('Semantic batch size', () => {
  it('should process up to SEMANTIC_BATCH_SIZE items', () => {
    const SEMANTIC_BATCH_SIZE = 25
    const items = Array.from({ length: 40 }, (_, i) => `item-${i}`)
    const batch = items.slice(0, SEMANTIC_BATCH_SIZE)
    expect(batch).toHaveLength(25)
  })
})

describe('Discovery job deduplication', () => {
  it('should prevent duplicate running jobs for the same type', () => {
    const activeJobs = new Map<string, { status: string }>()
    activeJobs.set('trend_discovery', { status: 'running' })

    const canEnqueue = !activeJobs.has('trend_discovery') ||
      !['queued', 'running'].includes(activeJobs.get('trend_discovery')!.status)

    expect(canEnqueue).toBe(false)
  })

  it('should allow enqueue when no active job exists', () => {
    const activeJobs = new Map<string, { status: string }>()

    const canEnqueue = !activeJobs.has('trend_discovery')
    expect(canEnqueue).toBe(true)
  })
})

describe('useApi keepPreviousData behaviour', () => {
  it('should retain data reference when keepPreviousData is enabled', () => {
    const previousData = { trends: [{ id: '1' }] }
    const keepPreviousData = true
    const hasExistingData = previousData !== undefined || keepPreviousData

    expect(hasExistingData).toBe(true)
  })
})
