'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  Film,
  FolderTree,
  Inbox,
  Plus,
  Radar,
  RefreshCw,
  Save,
  Trash2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import {
  DEFAULT_FRONTIFY_INBOX_NAME,
  type FrontifyIntakeAssetItem,
  type FrontifyIntakeDayFolder,
  type FrontifyIntakeLibraryConfig,
  type FrontifyIntakeOverviewResponse,
} from '@/src/domain/frontifyIntake/types'

type MessageState = { type: 'success' | 'error'; text: string } | null

function createLibraryDraft(): FrontifyIntakeLibraryConfig {
  return {
    id: `frontify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    label: '',
    libraryId: '',
    inboxFolderName: DEFAULT_FRONTIFY_INBOX_NAME,
    enabled: true,
  }
}

function formatDateTime(value: string | null) {
  if (!value) return 'Unknown'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return value
  return parsed.toLocaleString()
}

function SignalCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string
  value: string
  detail: string
  icon: React.ElementType
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="flex items-start justify-between gap-4 p-6">
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            {label}
          </div>
          <div className="font-mono text-3xl text-foreground">{value}</div>
          <div className="text-sm text-muted-foreground">{detail}</div>
        </div>
        <div className="rounded-md border border-border/70 bg-muted/30 p-2 text-muted-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </CardContent>
    </Card>
  )
}

function FolderSection({
  title,
  description,
  assets,
}: {
  title: string
  description: string
  assets: FrontifyIntakeAssetItem[]
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-background/40">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 px-4 py-3">
        <div>
          <div className="font-medium text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground">{description}</div>
        </div>
        <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
          {assets.length} assets
        </Badge>
      </div>
      {assets.length === 0 ? (
        <div className="px-4 py-5 text-sm text-muted-foreground">No assets in this folder yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="border-b border-border/70 text-left">
              <tr className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
                <th className="px-4 py-3 font-mono font-normal">Asset</th>
                <th className="px-4 py-3 font-mono font-normal">Status</th>
                <th className="px-4 py-3 font-mono font-normal">Author</th>
                <th className="px-4 py-3 font-mono font-normal">Created</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((asset) => (
                <tr key={asset.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{asset.title}</div>
                    <div className="font-mono text-[11px] text-muted-foreground">{asset.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
                      {asset.status}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{asset.author ?? 'Unknown'}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDateTime(asset.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function LibraryCard({
  library,
}: {
  library: FrontifyIntakeOverviewResponse['libraries'][number]
}) {
  const dayFolders = library.dayFolders.filter((folder) => folder.assetCount > 0)
  const emptyFolders = library.dayFolders.filter((folder) => folder.assetCount === 0)

  return (
    <Card className="border-border/70">
      <CardHeader className="gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
              Frontify Library
            </div>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Inbox className="h-4 w-4 text-muted-foreground" />
              {library.config.label}
            </CardTitle>
            <CardDescription>
              Library ID `{library.config.libraryId}` · Inbox `{library.config.inboxFolderName}`
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-[10px] uppercase tracking-[0.2em]">
              {library.totalAssets} submitted
            </Badge>
            {library.error ? (
              <Badge variant="destructive">Needs attention</Badge>
            ) : (
              <Badge variant="secondary">Readable</Badge>
            )}
          </div>
        </div>
        {library.error && (
          <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
            {library.error}
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {library.rootAssets.length > 0 && (
          <FolderSection
            title="Inbox root"
            description="Assets placed directly in the submission inbox before date bucketing."
            assets={library.rootAssets}
          />
        )}

        {dayFolders.length > 0 ? (
          dayFolders.map((folder: FrontifyIntakeDayFolder) => (
            <FolderSection
              key={folder.id}
              title={folder.name}
              description="Date bucket discovered in the Asset Submission Inbox."
              assets={folder.assets}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
            {library.inboxFolderId
              ? 'The inbox exists, but there are no submitted assets in its dated subfolders yet.'
              : 'Heimdall could not locate this inbox folder yet.'}
          </div>
        )}

        {emptyFolders.length > 0 && (
          <div className="text-xs text-muted-foreground">
            Empty date folders: {emptyFolders.map((folder) => folder.name).join(', ')}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default function FrontifyIntakePage() {
  const [overview, setOverview] = useState<FrontifyIntakeOverviewResponse | null>(null)
  const [libraries, setLibraries] = useState<FrontifyIntakeLibraryConfig[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<MessageState>(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setMessage(null)
    try {
      const res = await fetch('/api/frontify-intake/inbox')
      const data = (await res.json()) as FrontifyIntakeOverviewResponse | { error?: string }
      if (!res.ok) {
        throw new Error('error' in data ? data.error : 'Failed to load Frontify intake overview')
      }
      setOverview(data as FrontifyIntakeOverviewResponse)
      setLibraries((data as FrontifyIntakeOverviewResponse).settings.libraries)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to load Frontify intake overview',
      })
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSave = async () => {
    setSaving(true)
    setMessage(null)
    try {
      const payload = { settings: { libraries } }
      const res = await fetch('/api/frontify-intake/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error ?? 'Failed to save Frontify intake settings')
      }
      setMessage({ type: 'success', text: 'Frontify intake settings saved.' })
      await refresh()
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save Frontify intake settings',
      })
    } finally {
      setSaving(false)
    }
  }

  const updateLibrary = (
    index: number,
    field: keyof FrontifyIntakeLibraryConfig,
    value: string | boolean
  ) => {
    setLibraries((current) => {
      const next = [...current]
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  const enabledCount = useMemo(
    () => libraries.filter((library) => library.enabled).length,
    [libraries]
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            01 Frontify intake
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Submission inbox overview</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Aggregate Frontify submission inboxes across libraries so operators can see what has
            landed before bulk rename and routing are enabled.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={loading}>
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            Refresh
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            <Save className="h-4 w-4" />
            {saving ? 'Saving…' : 'Save intake config'}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SignalCard
          label="Configured libraries"
          value={String(libraries.length)}
          detail={`${enabledCount} enabled for inbox sync`}
          icon={Radar}
        />
        <SignalCard
          label="Visible inboxes"
          value={String(overview?.totals.libraries ?? 0)}
          detail="Libraries currently queried by Heimdall"
          icon={Inbox}
        />
        <SignalCard
          label="Date buckets"
          value={String(overview?.totals.dayFolders ?? 0)}
          detail="Dated subfolders discovered inside inboxes"
          icon={FolderTree}
        />
        <SignalCard
          label="Submitted assets"
          value={String(overview?.totals.assets ?? 0)}
          detail={overview?.hasToken ? 'Fetched from Frontify GraphQL' : 'Waiting for Frontify token'}
          icon={Film}
        />
      </div>

      {(message || overview?.message) && (
        <Card className={cn(
          'border-border/70',
          (message?.type === 'error' || !overview?.hasToken) && 'border-destructive/40'
        )}>
          <CardContent className="flex items-start gap-3 p-4 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="space-y-1">
              {message && <div>{message.text}</div>}
              {overview?.message && <div className="text-muted-foreground">{overview.message}</div>}
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="border-border/70">
        <CardHeader>
          <CardTitle>Inbox configuration</CardTitle>
          <CardDescription>
            Register the Frontify libraries Heimdall should poll. Each library keeps its own inbox;
            Heimdall provides the unified overview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {libraries.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border/70 px-4 py-5 text-sm text-muted-foreground">
              No Frontify libraries configured yet.
            </div>
          ) : (
            libraries.map((library, index) => (
              <div key={library.id} className="rounded-lg border border-border/70 p-4">
                <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr_1fr_auto]">
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Label
                    </label>
                    <input
                      type="text"
                      value={library.label}
                      onChange={(event) => updateLibrary(index, 'label', event.target.value)}
                      placeholder="Loop UGC Master Library"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Library ID
                    </label>
                    <input
                      type="text"
                      value={library.libraryId}
                      onChange={(event) => updateLibrary(index, 'libraryId', event.target.value)}
                      placeholder="123456789"
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                      Inbox folder
                    </label>
                    <input
                      type="text"
                      value={library.inboxFolderName}
                      onChange={(event) =>
                        updateLibrary(index, 'inboxFolderName', event.target.value)
                      }
                      placeholder={DEFAULT_FRONTIFY_INBOX_NAME}
                      className="w-full rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    />
                  </div>
                  <div className="flex items-end justify-between gap-3 lg:justify-end">
                    <label className="flex items-center gap-2 text-sm text-muted-foreground">
                      <input
                        type="checkbox"
                        checked={library.enabled}
                        onChange={(event) => updateLibrary(index, 'enabled', event.target.checked)}
                      />
                      Enabled
                    </label>
                    <Button
                      variant="destructive"
                      size="icon"
                      onClick={() =>
                        setLibraries((current) => current.filter((item) => item.id !== library.id))
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}

          <Button
            variant="outline"
            onClick={() => setLibraries((current) => [...current, createLibraryDraft()])}
          >
            <Plus className="h-4 w-4" />
            Add library inbox
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {overview?.libraries.length ? (
          overview.libraries.map((library) => (
            <LibraryCard key={library.config.id} library={library} />
          ))
        ) : (
          <Card className="border-border/70">
            <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
              <Inbox className="h-8 w-8 text-muted-foreground" />
              <div className="space-y-1">
                <div className="text-lg font-medium">No Frontify inboxes are active yet</div>
                <div className="max-w-2xl text-sm text-muted-foreground">
                  Save one or more library IDs above, then refresh to let Heimdall pull the
                  submission overview. Once you share the real naming convention inputs, this page
                  can become the launch point for bulk rename.
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
