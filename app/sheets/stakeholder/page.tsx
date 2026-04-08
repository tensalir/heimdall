'use client'

import { useCallback, useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { StakeholderSheet, type StakeholderRound } from '@/components/sheets/StakeholderSheet'

function StakeholderPageContent() {
  const searchParams = useSearchParams()
  const roundParam = searchParams.get('round')

  const [rounds, setRounds] = useState<StakeholderRound[]>([])
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(roundParam)
  const [loadingRounds, setLoadingRounds] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [refreshTrigger, setRefreshTrigger] = useState(0)

  const fetchRounds = useCallback(async () => {
    setLoadingRounds(true)
    try {
      const res = await fetch('/api/feedback')
      const data = await res.json()
      if (res.ok && Array.isArray(data.rounds)) {
        setRounds(data.rounds)
        if (roundParam && data.rounds.some((r: StakeholderRound) => r.id === roundParam)) {
          setSelectedRoundId(roundParam)
        } else if (data.rounds.length > 0 && !selectedRoundId) {
          setSelectedRoundId(data.rounds[0].id)
        }
      }
    } catch {
      setRounds([])
    } finally {
      setLoadingRounds(false)
    }
  }, [roundParam])

  useEffect(() => {
    fetchRounds()
  }, [fetchRounds])

  useEffect(() => {
    if (roundParam) setSelectedRoundId(roundParam)
  }, [roundParam])

  const handleSelectRound = useCallback((id: string) => {
    setSelectedRoundId(id)
  }, [])

  const handleSync = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/feedback/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundId: selectedRoundId ?? undefined }),
      })
      const data = await res.json()
      if (res.ok && data.roundId) {
        setSelectedRoundId(data.roundId)
        await fetchRounds()
      }
    } finally {
      setSyncing(false)
    }
  }, [selectedRoundId, fetchRounds])

  const handleImportExcel = useCallback(
    async (file: File, roundId: string | null) => {
      setImportError(null)
      setImporting(true)
      try {
        const form = new FormData()
        form.append('file', file)
        if (roundId) form.append('roundId', roundId)
        const res = await fetch('/api/feedback/import-excel', {
          method: 'POST',
          body: form,
        })
        const data = await res.json()
        if (!res.ok) {
          setImportError(data.error ?? 'Import failed')
          return
        }
        await fetchRounds()
        if (data.roundId) setSelectedRoundId(data.roundId)
        setRefreshTrigger((k) => k + 1)
      } catch {
        setImportError('Import failed')
      } finally {
        setImporting(false)
      }
    },
    [fetchRounds]
  )

  const handleCreateRound = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const data = await res.json()
      if (res.ok && data.id) {
        await fetchRounds()
        setSelectedRoundId(data.id)
      }
    } catch {
      // silently fail
    }
  }, [fetchRounds])

  const handleDeleteRound = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/feedback/rounds/${id}`, { method: 'DELETE' })
      if (res.ok) {
        const remaining = rounds.filter((r) => r.id !== id)
        setRounds(remaining)
        if (selectedRoundId === id) {
          setSelectedRoundId(remaining[0]?.id ?? null)
        }
      }
    } catch {
      // silently fail
    }
  }, [rounds, selectedRoundId])

  if (loadingRounds) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <StakeholderSheet
      rounds={rounds}
      selectedRoundId={selectedRoundId}
      onSelectRound={handleSelectRound}
      onSync={handleSync}
      onImportExcel={handleImportExcel}
      onCreateRound={handleCreateRound}
      onDeleteRound={handleDeleteRound}
      syncing={syncing}
      importing={importing}
      importError={importError}
      refreshTrigger={refreshTrigger}
    />
  )
}

export default function StakeholderPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      }
    >
      <StakeholderPageContent />
    </Suspense>
  )
}
