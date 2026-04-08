'use client'

import { useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { SheetTabs } from './SheetTabs'
import { Button } from '@/components/ui/button'
import {
  RefreshCw,
  Loader2,
  ArrowLeft,
  FileUp,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  CheckCircle,
  Send,
  ChevronDown,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useFeedbackData, getOrderedAgencies } from '@/components/feedback/useFeedbackData'
import { StakeholderTable } from './StakeholderTable'
import { StakeholderPreviewPanel } from './StakeholderPreviewPanel'

export interface StakeholderRound {
  id: string
  name: string
  monday_board_id: string
  created_at: string
}

interface StakeholderSheetProps {
  rounds: StakeholderRound[]
  selectedRoundId: string | null
  onSelectRound: (id: string) => void
  onSync: () => Promise<void>
  onImportExcel: (file: File, roundId: string | null) => Promise<void>
  onCreateRound?: () => Promise<void>
  onDeleteRound?: (id: string) => Promise<void>
  syncing: boolean
  importing: boolean
  importError: string | null
  refreshTrigger: number
}

export function StakeholderSheet({
  rounds,
  selectedRoundId,
  onSelectRound,
  onSync,
  onImportExcel,
  onCreateRound,
  onDeleteRound,
  syncing,
  importing,
  importError,
  refreshTrigger,
}: StakeholderSheetProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)


  const [previewPanelOpen, setPreviewPanelOpen] = useState(true)
  const [roundDropdownOpen, setRoundDropdownOpen] = useState(false)
  const [selectedAgency, setSelectedAgency] = useState<string | null>(null)

  const { byAgency, loading, error, refetch } = useFeedbackData(selectedRoundId, refreshTrigger)
  const orderedAgencies = getOrderedAgencies(byAgency)

  const totalExperiments = Object.values(byAgency).reduce((s, arr) => s + arr.length, 0)
  const withSummaryCount = Object.values(byAgency).reduce(
    (s, arr) => s + arr.filter((e) => e.summary_cache).length,
    0
  )
  const sentToMondayCount = Object.values(byAgency).reduce(
    (s, arr) => s + arr.filter((e) => e.sent_to_monday).length,
    0
  )

  const selectedRound = rounds.find((r) => r.id === selectedRoundId)
  const tabItems = rounds.map((r) => ({ id: r.id, label: r.name }))

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    await onImportExcel(file, selectedRoundId)
  }

  const switchTab = useCallback(
    (id: string) => {
      onSelectRound(id)
      setSelectedAgency(null)
    },
    [onSelectRound]
  )

  // Empty state: no rounds
  if (rounds.length === 0) {
    return (
      <div className="h-full flex flex-col bg-background text-foreground">
        <StakeholderHeader
          roundName={null}
          rounds={[]}
          selectedRoundId={null}
          onSelectRound={() => {}}
          totalExperiments={0}
          withSummaryCount={0}
          sentToMondayCount={0}
          onImportClick={() => fileInputRef.current?.click()}
          onSync={onSync}
          importing={importing}
          syncing={syncing}
          importError={importError}
          fileInputRef={fileInputRef}
          onFileChange={handleFileChange}
          roundDropdownOpen={roundDropdownOpen}
          setRoundDropdownOpen={setRoundDropdownOpen}
        />
        <div className="flex-1 min-h-0 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            {importError && (
              <p className="text-sm text-destructive mb-4">{importError}</p>
            )}
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-card border border-border mb-4 mx-auto">
              <ClipboardList className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-lg font-semibold text-foreground mb-2">No rounds yet</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Import your Excel consolidation file to create rounds (one per worksheet), or sync from Monday.
            </p>
            <div className="flex gap-3 justify-center flex-wrap">
              {onCreateRound && (
                <Button onClick={onCreateRound}>
                  <Plus className="h-4 w-4" />
                  <span className="ml-2">New Sheet</span>
                </Button>
              )}
              <Button variant={onCreateRound ? 'outline' : 'default'} onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
                <span className="ml-2">Import from Excel</span>
              </Button>
              <Button variant="outline" onClick={onSync} disabled={syncing}>
                {syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                <span className="ml-2">Sync from Monday</span>
              </Button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  // Full sheet layout (mirrors CommentSheet)
  return (
    <div className="h-full flex flex-col bg-background text-foreground">
      <StakeholderHeader
        roundName={selectedRound?.name}
        rounds={rounds}
        selectedRoundId={selectedRoundId}
        onSelectRound={(id) => {
          onSelectRound(id)
          setRoundDropdownOpen(false)
        }}
        totalExperiments={totalExperiments}
        withSummaryCount={withSummaryCount}
        sentToMondayCount={sentToMondayCount}
        onImportClick={() => fileInputRef.current?.click()}
        onSync={onSync}
        importing={importing}
        syncing={syncing}
        importError={importError}
        fileInputRef={fileInputRef}
        onFileChange={handleFileChange}
        roundDropdownOpen={roundDropdownOpen}
        setRoundDropdownOpen={setRoundDropdownOpen}
      />

      {/* Main content: left preview panel + right table */}
      <div className="flex flex-1 min-h-0">
        {/* Left preview panel — collapsible, same as CommentSheet */}
        <aside
          className={cn(
            'flex-shrink-0 border-r border-primary/20 bg-primary/[0.03] flex flex-col transition-all duration-300 ease-in-out relative',
            previewPanelOpen ? 'w-[380px] pt-4 pb-4' : 'w-0 pt-4 pb-4 overflow-hidden border-r-0'
          )}
        >
          {previewPanelOpen && (
            <StakeholderPreviewPanel
              roundName={selectedRound?.name}
              roundCreatedAt={selectedRound?.created_at}
              experimentCount={totalExperiments}
              agencyCount={orderedAgencies.length}
              selectedAgency={selectedAgency}
            />
          )}
        </aside>

        {/* Collapse/expand toggle */}
        <button
          onClick={() => setPreviewPanelOpen((v) => !v)}
          className={cn(
            'flex-shrink-0 flex items-center justify-center w-5 hover:bg-muted/40 transition-colors',
            'text-muted-foreground/40 hover:text-muted-foreground/70',
            'border-r border-border/30'
          )}
          aria-label={previewPanelOpen ? 'Hide preview panel' : 'Show preview panel'}
          title={previewPanelOpen ? 'Hide preview' : 'Show preview'}
        >
          {previewPanelOpen ? (
            <ChevronLeft className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {/* Table + tab bar + footer */}
        <div className="flex flex-col flex-1 min-w-0">
          {importError && (
            <p className="px-5 py-2 text-sm text-destructive bg-destructive/5">{importError}</p>
          )}

          {!selectedRoundId ? null : loading ? (
            <div className="flex-1 flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="flex-1 flex items-center justify-center p-8">
              <div className="text-center">
                <p className="text-sm text-destructive mb-3">{error}</p>
                <Button variant="outline" size="sm" onClick={() => refetch()}>
                  Retry
                </Button>
              </div>
            </div>
          ) : (
            <StakeholderTable
              byAgency={byAgency}
              orderedAgencies={orderedAgencies}
              selectedAgency={selectedAgency}
              onSelectAgency={setSelectedAgency}
              onEntrySaved={refetch}
              onSummaryGenerated={refetch}
            />
          )}

          <SheetTabs
            tabs={tabItems}
            activeId={selectedRoundId}
            onSelect={switchTab}
            onAdd={onCreateRound}
            onDelete={onDeleteRound ? (id, label) => {
              if (window.confirm(`Delete "${label}"? All experiments and feedback in this sheet will be permanently removed.`)) {
                onDeleteRound(id)
              }
            } : undefined}
          />

          {/* Footer — match CommentSheet */}
          <footer className="flex-shrink-0 border-t border-border/50 px-5 py-2 bg-card/20">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground/60">
              <span className="flex items-center gap-1.5">
                <ClipboardList className="h-3 w-3" />
                {totalExperiments} experiment{totalExperiments !== 1 ? 's' : ''} in this round
                {orderedAgencies.length ? ` · ${orderedAgencies.length} agenc${orderedAgencies.length !== 1 ? 'ies' : 'y'}` : ''}
              </span>
              <span>Powered by Heimdall</span>
            </div>
          </footer>
        </div>
      </div>
    </div>
  )
}

// ── StakeholderHeader (matches CommentHeader structure) ─────────────────────

interface StakeholderHeaderProps {
  roundName: string | null
  rounds: StakeholderRound[]
  selectedRoundId: string | null
  onSelectRound: (id: string) => void
  totalExperiments: number
  withSummaryCount: number
  sentToMondayCount: number
  onImportClick: () => void
  onSync: () => void
  importing: boolean
  syncing: boolean
  importError: string | null
  fileInputRef: React.RefObject<HTMLInputElement | null>
  onFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void
  roundDropdownOpen: boolean
  setRoundDropdownOpen: (v: boolean) => void
}

function StakeholderHeader({
  roundName,
  rounds,
  selectedRoundId,
  onSelectRound,
  totalExperiments,
  withSummaryCount,
  sentToMondayCount,
  onImportClick,
  onSync,
  importing,
  syncing,
  fileInputRef,
  onFileChange,
  roundDropdownOpen,
  setRoundDropdownOpen,
}: StakeholderHeaderProps) {
  return (
    <header className="flex-shrink-0 border-b border-border bg-card/80 backdrop-blur-sm">
      <div className="px-5 py-3.5">
        <div className="flex items-center justify-between gap-4">
          {/* Left: Back + Branding + Round selector */}
          <div className="flex items-center gap-4 min-w-0">
            <a
              href="/sheets"
              className="flex items-center justify-center w-8 h-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors flex-shrink-0"
              title="Back to sheets"
            >
              <ArrowLeft className="h-4 w-4" />
            </a>

            <div className="flex items-center gap-2.5 flex-shrink-0">
              <span className="text-lg font-semibold tracking-tight text-foreground">
                Heimdall
              </span>
              <span className="text-xs text-muted-foreground/40 font-medium">
                Stakeholder
              </span>
            </div>

            <div className="h-5 w-px bg-border/60 flex-shrink-0" />

            {/* Round selector with dropdown */}
            <div className="relative min-w-0">
              <button
                onClick={() => rounds.length > 0 && setRoundDropdownOpen((v) => !v)}
                disabled={rounds.length === 0}
                className="flex items-center gap-1.5 min-w-0 hover:bg-muted/30 rounded-md px-2 py-1 -mx-2 -my-1 transition-colors disabled:opacity-50"
              >
                <div className="min-w-0">
                  <h1 className="text-sm font-medium text-foreground truncate" title={roundName ?? undefined}>
                    {roundName ?? 'No round selected'}
                  </h1>
                  <p className="text-[11px] text-muted-foreground/60 truncate">
                    {rounds.length > 0 ? `${rounds.length} round${rounds.length !== 1 ? 's' : ''}` : 'Import or sync to add rounds'}
                  </p>
                </div>
                {rounds.length > 1 && (
                  <ChevronDown
                    className={cn(
                      'h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 transition-transform',
                      roundDropdownOpen && 'rotate-180'
                    )}
                  />
                )}
              </button>

              {roundDropdownOpen && rounds.length > 1 && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setRoundDropdownOpen(false)}
                  />
                  <div className="absolute top-full left-0 mt-1 z-50 min-w-[280px] rounded-lg border border-border bg-card shadow-lg py-1">
                    <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/40 font-medium">
                      Rounds
                    </div>
                    {rounds.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => {
                          onSelectRound(r.id)
                          setRoundDropdownOpen(false)
                        }}
                        className={cn(
                          'w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors',
                          r.id === selectedRoundId
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-foreground hover:bg-muted/30'
                        )}
                      >
                        <span className={cn(
                          'w-1.5 h-1.5 rounded-full flex-shrink-0',
                          r.id === selectedRoundId ? 'bg-primary' : 'bg-muted-foreground/40'
                        )} />
                        <span className="truncate">{r.name}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Right: Stats + Actions */}
          <div className="flex items-center gap-4 flex-shrink-0">
            {roundName != null && (
              <div className="flex items-center gap-3 text-[11px] text-muted-foreground/60">
                <span className="flex items-center gap-1">
                  <ClipboardList className="h-3 w-3" />
                  {totalExperiments}
                </span>
                <span className="flex items-center gap-1 text-blue-400/70">
                  <CheckCircle className="h-3 w-3" />
                  {withSummaryCount} with summary
                </span>
                <span className="flex items-center gap-1 text-emerald-400/70">
                  <Send className="h-3 w-3" />
                  {sentToMondayCount} sent
                </span>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={onFileChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={onImportClick}
              disabled={importing}
              className="inline-flex items-center gap-1.5"
            >
              {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}
              Import
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onSync}
              disabled={syncing}
              className="inline-flex items-center gap-1.5"
            >
              {syncing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Sync
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}
