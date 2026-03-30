'use client'

import { useCallback, useEffect, useState } from 'react'
import { BookOpen, ChevronDown, ChevronRight, Loader2, RefreshCw, Trash2, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface Collection {
  id: string
  slug: string
  name: string
  description: string | null
  created_at: string
}

interface DocRow {
  id: string
  filename: string
  status: string
  chunk_count: number | null
  error_message: string | null
  created_at: string
}

interface DocDetail {
  parsed_markdown_preview: string | null
  relation_count: number
  entity_count: number
}

interface CollectionStats {
  document_count: number
  chunk_count: number
  entity_count: number
  relation_count: number
}

export default function DocumentChatPage() {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedId, setSelectedId] = useState<string>('')
  const [docs, setDocs] = useState<DocRow[]>([])
  const [docsLoading, setDocsLoading] = useState(false)
  const [stats, setStats] = useState<CollectionStats | null>(null)
  const [statsLoading, setStatsLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailById, setDetailById] = useState<Record<string, DocDetail>>({})
  const [detailLoading, setDetailLoading] = useState<string | null>(null)
  const [actionId, setActionId] = useState<string | null>(null)

  const [newSlug, setNewSlug] = useState('')
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const loadCollections = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/document-chat/collections', { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? `Failed to load collections (${res.status})`)
        setCollections([])
        return
      }
      setCollections(data.collections ?? [])
      setMessage(null)
    } finally {
      setLoading(false)
    }
  }, [])

  const loadStats = useCallback(async (collectionId: string) => {
    if (!collectionId) {
      setStats(null)
      return
    }
    setStatsLoading(true)
    try {
      const res = await fetch(
        `/api/document-chat/stats?collection_id=${encodeURIComponent(collectionId)}`,
        { credentials: 'include' },
      )
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setStats({
          document_count: data.document_count ?? 0,
          chunk_count: data.chunk_count ?? 0,
          entity_count: data.entity_count ?? 0,
          relation_count: data.relation_count ?? 0,
        })
      } else {
        setStats(null)
      }
    } finally {
      setStatsLoading(false)
    }
  }, [])

  const loadDocs = useCallback(async (collectionId: string) => {
    if (!collectionId) {
      setDocs([])
      return
    }
    setDocsLoading(true)
    try {
      const res = await fetch(
        `/api/document-chat/documents?collection_id=${encodeURIComponent(collectionId)}`,
        { credentials: 'include' },
      )
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? 'Failed to load documents')
        setDocs([])
        return
      }
      setDocs(data.documents ?? [])
    } finally {
      setDocsLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadCollections()
  }, [loadCollections])

  useEffect(() => {
    if (selectedId) {
      void loadDocs(selectedId)
      void loadStats(selectedId)
    } else {
      setDocs([])
      setStats(null)
    }
  }, [selectedId, loadDocs, loadStats])

  async function loadDetail(documentId: string) {
    setDetailLoading(documentId)
    try {
      const res = await fetch(`/api/document-chat/documents/${documentId}`, { credentials: 'include' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.document) {
        setDetailById((prev) => ({
          ...prev,
          [documentId]: {
            parsed_markdown_preview: data.document.parsed_markdown_preview,
            relation_count: data.document.relation_count,
            entity_count: data.document.entity_count,
          },
        }))
      }
    } finally {
      setDetailLoading(null)
    }
  }

  function toggleExpand(documentId: string) {
    if (expandedId === documentId) {
      setExpandedId(null)
      return
    }
    setExpandedId(documentId)
    if (!detailById[documentId]) void loadDetail(documentId)
  }

  async function createCollection(e: React.FormEvent) {
    e.preventDefault()
    setMessage(null)
    const res = await fetch('/api/document-chat/collections', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: newSlug.trim(),
        name: newName.trim(),
        description: newDesc.trim() || undefined,
      }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage(data.error ?? 'Create failed')
      return
    }
    setNewSlug('')
    setNewName('')
    setNewDesc('')
    await loadCollections()
    if (data.collection?.id) setSelectedId(data.collection.id)
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length || !selectedId) return
    setUploading(true)
    setMessage(null)
    const form = new FormData()
    form.set('collection_id', selectedId)
    for (let i = 0; i < files.length; i++) {
      form.append('files', files[i]!)
    }
    try {
      const res = await fetch('/api/document-chat/upload', {
        method: 'POST',
        credentials: 'include',
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? 'Upload failed')
        return
      }
      const errs = (data.results as Array<{ filename: string; error?: string }>)?.filter((r) => r.error)
      if (errs?.length) {
        setMessage(
          `Some files failed: ${errs.map((e) => `${e.filename}: ${e.error}`).join('; ')}`,
        )
      }
      await loadDocs(selectedId)
      await loadStats(selectedId)
    } finally {
      setUploading(false)
    }
  }

  async function deleteDoc(documentId: string) {
    if (!confirm('Delete this document and all its chunks / graph links for this file?')) return
    setActionId(documentId)
    setMessage(null)
    try {
      const res = await fetch(`/api/document-chat/documents/${documentId}`, {
        method: 'DELETE',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? 'Delete failed')
        return
      }
      setExpandedId(null)
      await loadDocs(selectedId)
      await loadStats(selectedId)
    } finally {
      setActionId(null)
    }
  }

  async function reprocessDoc(documentId: string) {
    setActionId(documentId)
    setMessage(null)
    try {
      const res = await fetch(`/api/document-chat/documents/${documentId}/reprocess`, {
        method: 'POST',
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setMessage(data.error ?? 'Reprocess failed')
        return
      }
      await loadDocs(selectedId)
      await loadStats(selectedId)
      if (expandedId === documentId) {
        setDetailById((p) => {
          const next = { ...p }
          delete next[documentId]
          return next
        })
        void loadDetail(documentId)
      }
    } finally {
      setActionId(null)
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-2 text-primary">
          <BookOpen className="h-8 w-8" />
          <h1 className="text-2xl font-semibold tracking-tight">Loop Document Chat</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Upload documents (LlamaParse for PDF/DOCX/PPTX/XLSX when{' '}
          <code className="text-xs bg-muted px-1 rounded">LLAMA_CLOUD_API_KEY</code> is set), then query via
          GPT Actions (
          <code className="text-xs bg-muted px-1 rounded">/api/gpt-actions/search</code>
          {' · '}
          <code className="text-xs bg-muted px-1 rounded">include_graph</code>
          {' · '}
          <code className="text-xs bg-muted px-1 rounded">/api/gpt-actions/answer</code>
          ). Bulk folder ingest:{' '}
          <code className="text-xs bg-muted px-1 rounded">npm run ingest:document-chat</code> — see{' '}
          <code className="text-xs bg-muted px-1 rounded">docs/document-chat-gpt-actions.md</code>.
        </p>
      </div>

      {message && (
        <div
          className={cn(
            'rounded-md border px-3 py-2 text-sm',
            message.startsWith('Some files failed')
              ? 'border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-100'
              : 'border-destructive/50 bg-destructive/10 text-destructive',
          )}
        >
          {message}
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Corpus
        </h2>
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading collections…
          </div>
        ) : (
          <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
            <div className="flex-1 space-y-1">
              <label className="text-xs text-muted-foreground">Active collection</label>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                <option value="">— Select —</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.slug})
                  </option>
                ))}
              </select>
            </div>
            <label className="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground cursor-pointer hover:opacity-90 disabled:opacity-50">
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              Upload files
              <input
                type="file"
                multiple
                className="hidden"
                disabled={!selectedId || uploading}
                onChange={(e) => void onUpload(e.target.files)}
              />
            </label>
          </div>
        )}

        {selectedId && (
          <div className="rounded-md border border-dashed bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
            {statsLoading ? (
              <span className="inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading stats…
              </span>
            ) : stats ? (
              <span>
                <strong className="text-foreground">Graph + index:</strong> {stats.document_count} documents ·{' '}
                {stats.chunk_count} chunks · {stats.entity_count} entities · {stats.relation_count}{' '}
                relations
              </span>
            ) : (
              <span>Stats unavailable (run migration 030 if columns are missing).</span>
            )}
          </div>
        )}

        <form onSubmit={createCollection} className="grid gap-3 sm:grid-cols-3 border-t pt-4">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">New slug</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="loop-policies"
              value={newSlug}
              onChange={(e) => setNewSlug(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <label className="text-xs text-muted-foreground">Display name</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Loop policies"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              required
            />
          </div>
          <div className="sm:col-span-3 space-y-1">
            <label className="text-xs text-muted-foreground">Description (optional)</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Internal policy docs"
              value={newDesc}
              onChange={(e) => setNewDesc(e.target.value)}
            />
          </div>
          <div>
            <Button type="submit" variant="secondary" size="sm">
              Create collection
            </Button>
          </div>
        </form>
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Documents
        </h2>
        {!selectedId ? (
          <p className="text-sm text-muted-foreground">Select a collection to see uploads.</p>
        ) : docsLoading ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No files yet for this collection.</p>
        ) : (
          <ul className="divide-y text-sm">
            {docs.map((d) => {
              const open = expandedId === d.id
              const det = detailById[d.id]
              const busy = actionId === d.id
              return (
                <li key={d.id} className="py-2">
                  <div className="flex flex-wrap items-start gap-2 justify-between">
                    <button
                      type="button"
                      onClick={() => toggleExpand(d.id)}
                      className="flex items-center gap-1 text-left font-medium hover:text-primary"
                    >
                      {open ? (
                        <ChevronDown className="h-4 w-4 shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0" />
                      )}
                      {d.filename}
                    </button>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground text-xs">
                        {d.status}
                        {d.chunk_count != null ? ` · ${d.chunk_count} chunks` : ''}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2"
                        disabled={busy}
                        onClick={() => void reprocessDoc(d.id)}
                        title="Re-parse and re-embed"
                      >
                        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-destructive"
                        disabled={busy}
                        onClick={() => void deleteDoc(d.id)}
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                  {d.error_message && (
                    <span className="block text-destructive text-xs mt-1">{d.error_message}</span>
                  )}
                  {open && (
                    <div className="mt-2 pl-5 space-y-2 text-xs text-muted-foreground border-l-2 border-border ml-1">
                      {detailLoading === d.id && (
                        <span className="inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading detail…
                        </span>
                      )}
                      {det && (
                        <>
                          <p>
                            <strong className="text-foreground">KG (this file):</strong> {det.entity_count}{' '}
                            entities · {det.relation_count} relations (from chunk evidence)
                          </p>
                          {det.parsed_markdown_preview && (
                            <pre className="whitespace-pre-wrap break-words rounded bg-muted/50 p-2 max-h-40 overflow-y-auto text-[11px]">
                              {det.parsed_markdown_preview}
                            </pre>
                          )}
                          {!det.parsed_markdown_preview && (
                            <p className="italic">No stored markdown preview (plain-text extract).</p>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
