'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { Loader2, ArrowLeft, FileText } from 'lucide-react'
import { Nav } from '@/components/nav'
import { useIsPrivileged } from '@/lib/roles'

interface FigmaFile {
  key: string
  name: string
  thumbnail_url?: string
  last_modified?: string
}

function FileCard({
  file,
  projectId,
  onClick,
}: {
  file: FigmaFile
  projectId: string
  onClick: () => void
}) {
  const modified = file.last_modified
    ? new Date(file.last_modified).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : null

  return (
    <button
      onClick={onClick}
      className="group text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200"
    >
      <div className="aspect-[4/3] bg-muted/30 relative overflow-hidden">
        {file.thumbnail_url ? (
          <img
            src={file.thumbnail_url}
            alt={file.name}
            className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <FileText className="h-10 w-10 text-muted-foreground/30" />
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
        {modified && (
          <p className="text-[11px] text-muted-foreground/60 mt-0.5">Edited {modified}</p>
        )}
      </div>
    </button>
  )
}

function ProjectFilesContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const projectId = params.projectId as string
  const projectName = searchParams.get('name') ?? 'Project'

  const [files, setFiles] = useState<FigmaFile[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFiles = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/figma/projects/${projectId}/files`)
      const data = await res.json()
      if (res.ok) {
        setFiles(data.files ?? [])
      } else {
        setError(data.error ?? 'Failed to load files')
      }
    } catch {
      setError('Failed to connect to Figma')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => {
    fetchFiles()
  }, [fetchFiles])

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/sheets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Feedback Summarizer
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{projectName}</h1>
        <p className="text-muted-foreground">Select a file to view and consolidate Figma comments</p>
      </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">{error}</p>
            </div>
          ) : files.length === 0 ? (
            <div className="rounded-xl border border-border bg-card p-8 text-center">
              <p className="text-sm text-muted-foreground">No files found in this project.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {files.map((file) => (
                <FileCard
                  key={file.key}
                  file={file}
                  projectId={projectId}
                  onClick={() => router.push(`/sheets/${file.key}?project=${projectId}`)}
                />
              ))}
            </div>
          )}
    </div>
  )
}

function ProjectFilesPageInner() {
  const isPrivileged = useIsPrivileged()

  return (
    <div className="flex min-h-screen">
      {isPrivileged && <Nav />}
      <main className="flex-1 overflow-y-auto p-4 lg:p-6">
        <div className="mx-auto max-w-7xl">
          <ProjectFilesContent />
        </div>
      </main>
    </div>
  )
}

export default function ProjectFilesPage() {
  return (
    <Suspense
      fallback={
        <div className="h-full flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      }
    >
      <ProjectFilesPageInner />
    </Suspense>
  )
}
