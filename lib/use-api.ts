'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UseApiOptions<T> {
  initialData?: T
  revalidateOnFocus?: boolean
}

interface UseApiResult<T> {
  data: T | undefined
  error: string | null
  loading: boolean
  refetch: () => Promise<T | undefined>
  mutate: (updater: T | ((prev: T | undefined) => T)) => void
}

/**
 * Shared data-fetching hook for Briefing Assistant pages.
 * Provides loading/error/refetch/mutate patterns so individual
 * pages don't need to reimplement fetch lifecycle.
 */
export function useApi<T>(
  url: string | null,
  options: UseApiOptions<T> = {},
): UseApiResult<T> {
  const [data, setData] = useState<T | undefined>(options.initialData)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(!!url)
  const urlRef = useRef(url)
  urlRef.current = url

  const fetchData = useCallback(async (): Promise<T | undefined> => {
    const currentUrl = urlRef.current
    if (!currentUrl) return undefined

    setLoading(true)
    setError(null)
    try {
      const res = await fetch(currentUrl)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const msg = (body as { error?: string }).error ?? `Request failed (${res.status})`
        setError(msg)
        return undefined
      }
      const json = await res.json() as T
      setData(json)
      return json
    } catch {
      setError('Network request failed')
      return undefined
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (url) fetchData()
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

  return { data, error, loading, refetch: fetchData, mutate }
}
