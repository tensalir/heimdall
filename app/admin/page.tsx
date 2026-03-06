'use client'

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { RefreshCw, Check, Circle, Plus, Save, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface HealthServices {
  monday: 'ok' | 'error' | 'unconfigured'
  figma: 'ok' | 'error' | 'unconfigured'
  kv: 'ok' | 'error' | 'unconfigured'
  frontify: 'ok' | 'error' | 'unconfigured'
}

interface SetupChecks {
  kv: boolean
  monday: boolean
  figma: boolean
  routingMap: boolean
  webhookReceived: boolean
}

type RoutingEntry = { key: string; value: string }

/* -------------------------------------------------------------------------- */
/*  Connection Tile                                                           */
/* -------------------------------------------------------------------------- */

function ConnectionTile({
  name,
  description,
  status,
}: {
  name: string
  description: string
  status: 'ok' | 'error' | 'unconfigured' | 'placeholder'
}) {
  const statusBadge = () => {
    switch (status) {
      case 'ok':
        return <Badge variant="default">Connected</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'unconfigured':
        return <Badge variant="secondary">Not configured</Badge>
      case 'placeholder':
        return <Badge variant="outline">Coming soon</Badge>
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{name}</CardTitle>
        {statusBadge()}
      </CardHeader>
      <CardContent>
        <p className="text-xs text-muted-foreground">{description}</p>
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Mapping Editor (absorbed from /admin/routing)                             */
/* -------------------------------------------------------------------------- */

function MappingEditor({
  entries,
  setEntries,
  onSave,
  saving,
  message,
}: {
  entries: RoutingEntry[]
  setEntries: (e: RoutingEntry[]) => void
  onSave: () => void
  saving: boolean
  message: { type: 'success' | 'error'; text: string } | null
}) {
  const addEntry = () => setEntries([...entries, { key: '', value: '' }])
  const removeEntry = (index: number) => setEntries(entries.filter((_, i) => i !== index))
  const updateEntry = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...entries]
    updated[index][field] = value
    setEntries(updated)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Board → File Mapping</CardTitle>
        <CardDescription>
          Route Monday batches to Figma files. Format: canonical key (e.g. 2026-03) → Figma file key.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No mappings configured yet.</p>
        ) : (
          entries.map((entry, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                value={entry.key}
                onChange={(e) => updateEntry(index, 'key', e.target.value)}
                placeholder="2026-03"
                className="flex-1 rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <input
                type="text"
                value={entry.value}
                onChange={(e) => updateEntry(index, 'value', e.target.value)}
                placeholder="Figma file key..."
                className="flex-[2] rounded-md border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button variant="destructive" size="icon" onClick={() => removeEntry(index)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}

        <div className="flex gap-2 pt-4">
          <Button onClick={addEntry} variant="outline" className="flex-1">
            <Plus className="h-4 w-4 mr-2" />
            Add Entry
          </Button>
          <Button onClick={onSave} disabled={saving} className="flex-1">
            <Save className="h-4 w-4 mr-2" />
            {saving ? 'Saving...' : 'Save Mapping'}
          </Button>
        </div>

        {message && (
          <div
            className={cn(
              'rounded-md border p-3 text-sm',
              message.type === 'success'
                ? 'border-green-500/50 bg-green-500/10 text-green-500'
                : 'border-red-500/50 bg-red-500/10 text-red-500'
            )}
          >
            {message.text}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

/* -------------------------------------------------------------------------- */
/*  Connections Page                                                          */
/* -------------------------------------------------------------------------- */

export default function ConnectionsPage() {
  const [health, setHealth] = useState<HealthServices | null>(null)
  const [setup, setSetup] = useState<{ ready: boolean; checks: SetupChecks } | null>(null)
  const [entries, setEntries] = useState<RoutingEntry[]>([])
  const [saving, setSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const [healthRes, setupRes, settingsRes] = await Promise.all([
        fetch('/api/health/deep'),
        fetch('/api/setup'),
        fetch('/api/settings'),
      ])
      if (healthRes.ok) {
        const d = await healthRes.json()
        setHealth(d.services ?? null)
      }
      if (setupRes.ok) {
        const d = await setupRes.json()
        setSetup(d)
      }
      if (settingsRes.ok) {
        const d = await settingsRes.json()
        const map = d.routing || {}
        setEntries(Object.entries(map).map(([key, value]) => ({ key, value: String(value) })))
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const handleSaveMapping = async () => {
    setSaving(true)
    setSaveMessage(null)

    const routing = entries.reduce((acc, { key, value }) => {
      if (key && value) acc[key] = value
      return acc
    }, {} as Record<string, string>)

    try {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ routing }),
      })
      if (res.ok) {
        setSaveMessage({ type: 'success', text: 'Mapping saved successfully' })
      } else {
        const data = await res.json()
        setSaveMessage({ type: 'error', text: data.error || 'Failed to save' })
      }
    } catch (error) {
      setSaveMessage({ type: 'error', text: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Connections</h1>
          <p className="text-muted-foreground">Platform integrations and board-to-file routing</p>
        </div>
        <Button variant="outline" size="icon" onClick={refresh} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
        </Button>
      </div>

      {/* Setup checklist */}
      {setup && !setup.ready && (
        <Card className="border-primary/50">
          <CardHeader>
            <CardTitle>Setup checklist</CardTitle>
            <CardDescription>Complete these steps to get Heimdall fully running</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              <li className="flex items-center gap-2">
                {setup.checks.kv ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>KV store connected</span>
              </li>
              <li className="flex items-center gap-2">
                {setup.checks.monday ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Monday API key configured</span>
              </li>
              <li className="flex items-center gap-2">
                {setup.checks.figma ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>Figma API key configured</span>
              </li>
              <li className="flex items-center gap-2">
                {setup.checks.routingMap ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>At least one board-to-file mapping configured</span>
              </li>
              <li className="flex items-center gap-2">
                {setup.checks.webhookReceived ? (
                  <Check className="h-4 w-4 text-green-600" />
                ) : (
                  <Circle className="h-4 w-4 text-muted-foreground" />
                )}
                <span>At least one webhook received from Monday</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Connection tiles */}
      <div className="grid gap-4 md:grid-cols-3">
        <ConnectionTile
          name="Monday.com"
          description="Briefing source, webhook events, board data"
          status={health?.monday ?? 'unconfigured'}
        />
        <ConnectionTile
          name="Figma"
          description="Template files, comments, page management"
          status={health?.figma ?? 'unconfigured'}
        />
        <ConnectionTile
          name="Frontify"
          description="Asset management and brand guidelines"
          status={health?.frontify ?? 'unconfigured'}
        />
      </div>

      {/* Board → File mapping (absorbed from /admin/routing) */}
      <MappingEditor
        entries={entries}
        setEntries={setEntries}
        onSave={handleSaveMapping}
        saving={saving}
        message={saveMessage}
      />
    </div>
  )
}
