'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseApiOptions<T> {
  initialData?: T
  revalidateOnFocus?: boolean
  keepPreviousData?: boolean
}

interface UseApiResult<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  refreshing: boolean
  refetch: () => Promise<T | undefined>
  mutate: (updater: T | ((prev: T | undefined) => T)) => void
}

/**
 * Shared data-fetching hook for Briefing Assistant pages.
 * Keeps previous data visible during refetch when keepPreviousData is true,
 * uses AbortController to cancel stale requests on URL change.
 */
export function useApi<T>(
  url: string | null,
  options: UseApiOptions<T> = {},
): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(options.initialData)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!url)
  const [refreshing, setRefreshing] = useState(false)
  const urlRef = useRef(url)
  const abortRef = useRef<AbortController | null>(null)
  urlRef.current = url

  const fetchData = useCallback(async (): Promise<T | undefined> => {
    const currentUrl = urlRef.current
    if (!currentUrl) return undefined

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    const hasExistingData = data !== undefined || options.keepPreviousData
    if (hasExistingData) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }
    setError(null)
    try {
      const res = await fetch(currentUrl, { signal: controller.signal })
      if (controller.signal.aborted) return undefined
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error ?? `Request failed (${res.status})`
        setError(msg)
        return undefined
      }
      const json = await res.json() as T
      if (!controller.signal.aborted) {
        setData(json)
      }
      return json
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return undefined
      setError('Network request failed')
      return undefined
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
        setRefreshing(false)
      }
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (url) fetchData()
    return () => { abortRef.current?.abort() }
  }, [url, fetchData])

  useEffect(() => {
    if (!options.revalidateOnFocus) return
    function handleFocus() {
      fetchData()
    }
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData, options.revalidateOnFocus])

  const mutate = useCallback((updater: T | ((prev: T | undefined) => T)) => {
    setData((prev) => (typeof updater === 'function' ? (updater as (p: T | undefined) => T)(prev) : updater))
  }, [])

  return { data, error, loading, refreshing, refetch: fetchData, mutate }
}
