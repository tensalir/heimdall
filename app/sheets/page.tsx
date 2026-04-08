'use client'

import { useEffect, useState, useCallback } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import {
  MessageSquare,
  Loader2,
  ClipboardList,
  ArrowRight,
} from 'lucide-react'
import Link from 'next/link'
import { Nav } from '@/components/nav'
import { cn } from '@/lib/utils'
import { useIsPrivileged } from '@/lib/roles'

const PERFORMANCE_ADS_PROJECT_ID = '387033831'
const PERFORMANCE_ADS_PROJECT_NAME = 'Performance Ads'

interface FigmaFile {
  key: string
  name: string
  thumbnail_url?: string
  last_modified?: string
}

interface FeedbackRound {
  id: string
  name: string
  monday_board_id: string
  created_at: string
}

/* -------------------------------------------------------------------------- */
/*  Overview content (tabs + tab content)                                     */
/* -------------------------------------------------------------------------- */

function SheetsOverviewContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const tab = searchParams.get('tab')
  const activeTab = tab === 'stakeholder' ? 'stakeholder' : 'figma'

  const [figmaFiles, setFigmaFiles] = useState<FigmaFile[]>([])
  const [figmaLoading, setFigmaLoading] = useState(true)
  const [figmaError, setFigmaError] = useState<string | null>(null)

  const [rounds, setRounds] = useState<FeedbackRound[]>([])
  const [roundsLoading, setRoundsLoading] = useState(false)

  const fetchFigmaFiles = useCallback(async () => {
    setFigmaLoading(true)
    setFigmaError(null)
    try {
      const res = await fetch(`/api/figma/projects/${PERFORMANCE_ADS_PROJECT_ID}/files`)
      const data = await res.json()
      if (res.ok) {
        setFigmaFiles(data.files ?? [])
      } else {
        setFigmaError(data.error ?? 'Failed to load files')
      }
    } catch {
      setFigmaError('Failed to connect to Figma')
    } finally {
      setFigmaLoading(false)
    }
  }, [])

  const fetchRounds = useCallback(async () => {
    setRoundsLoading(true)
    try {
      const res = await fetch('/api/feedback')
      const data = await res.json()
      if (res.ok && Array.isArray(data.rounds)) {
        setRounds(data.rounds)
      }
    } catch {
      setRounds([])
    } finally {
      setRoundsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFigmaFiles()
  }, [fetchFigmaFiles])

  useEffect(() => {
    if (activeTab === 'stakeholder') {
      fetchRounds()
    }
  }, [activeTab, fetchRounds])

  const setTab = (newTab: 'figma' | 'stakeholder') => {
    if (newTab === 'stakeholder') {
      router.push('/sheets?tab=stakeholder')
    } else {
      router.push('/sheets')
    }
  }

  const latestRound = rounds.length > 0 ? rounds[0] : null

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feedback Summarizer</h1>
        <p className="text-muted-foreground">View and consolidate Figma comments and stakeholder feedback</p>
      </div>

      <div className="flex gap-0 rounded-lg p-0.5 bg-muted/50 w-fit">
        <button
          onClick={() => setTab('figma')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'figma'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Figma Comments
        </button>
        <button
          onClick={() => setTab('stakeholder')}
          className={cn(
            'px-4 py-2 text-sm font-medium rounded-md transition-colors',
            activeTab === 'stakeholder'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          )}
        >
          Stakeholder Feedback
        </button>
      </div>

      <div>
        {activeTab === 'figma' && (
          <div>
            {figmaLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <Link
                href={`/sheets/project/${PERFORMANCE_ADS_PROJECT_ID}?name=${encodeURIComponent(PERFORMANCE_ADS_PROJECT_NAME)}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-6 overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left w-full max-w-lg"
              >
                <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary shrink-0">
                  <MessageSquare className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold text-foreground">
                    {PERFORMANCE_ADS_PROJECT_NAME}
                  </h2>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    View and consolidate Figma comments across all files.
                  </p>
                  {!figmaError && (
                    <p className="text-xs text-muted-foreground/80 mt-2">
                      {figmaFiles.length} file{figmaFiles.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  {figmaError && (
                    <p className="text-xs text-muted-foreground/80 mt-2">{figmaError}</p>
                  )}
                </div>
                <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
              </Link>
            )}
          </div>
        )}

        {activeTab === 'stakeholder' && (
          <div className="space-y-6">
            {roundsLoading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : (
              <>
                <Link
                  href="/sheets/stakeholder"
                  className="group flex items-center gap-4 rounded-xl border border-border bg-card p-6 overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 text-left w-full max-w-lg"
                >
                  <div className="flex items-center justify-center w-14 h-14 rounded-xl bg-primary/10 text-primary shrink-0">
                    <ClipboardList className="h-7 w-7" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-foreground">
                      Stakeholder Feedback
                    </h2>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Consolidate strategy, design, and copy feedback. Import from Excel, send to Monday.
                    </p>
                    {rounds.length > 0 && (
                      <p className="text-xs text-muted-foreground/80 mt-2">
                        {rounds.length} round{rounds.length !== 1 ? 's' : ''}
                        {latestRound && ` · Latest: ${latestRound.name}`}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 text-muted-foreground group-hover:text-primary shrink-0" />
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/*  Page: sidebar + overview                                                  */
/* -------------------------------------------------------------------------- */

function SheetsOverviewPage() {
  const isPrivileged = useIsPrivileged()

  return (
    <div className="flex min-h-screen">
      {isPrivileged && <Nav />}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">
          <SheetsOverviewContent />
        </div>
      </main>
    </div>
  )
}

export default function SheetsIndexPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <SheetsOverviewPage />
    </Suspense>
  )
}
