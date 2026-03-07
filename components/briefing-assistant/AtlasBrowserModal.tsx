'use client'

import { useCallback, useEffect, useState } from 'react'
import { X, ExternalLink, RefreshCw, Loader2, Maximize2, Minimize2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AtlasBrowserModalProps {
  adId: string
  adName: string
  linkUrl: string | null
  onClose: () => void
}

export function AtlasBrowserModal({ adId, adName, linkUrl, onClose }: AtlasBrowserModalProps) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [imgKey, setImgKey] = useState(0)

  const atlasUrl = `/api/briefing-assistant/meta-ads/${adId}/atlas?width=${expanded ? 1200 : 600}&height=${expanded ? 1600 : 900}`

  const handleRefresh = useCallback(() => {
    setLoading(true)
    setError(false)
    setImgKey((k) => k + 1)
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleEsc)
    return () => document.removeEventListener('keydown', handleEsc)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className={cn(
          'relative z-10 flex flex-col bg-card border border-border rounded-xl shadow-2xl overflow-hidden transition-all duration-300',
          expanded ? 'w-[90vw] h-[90vh] max-w-[1400px]' : 'w-[680px] max-h-[85vh]',
        )}
      >
        <header className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card/80 flex-shrink-0">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground truncate">{adName}</p>
            <p className="text-[10px] text-muted-foreground/60">Atlas Browser Mirror</p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleRefresh}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Refresh"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setExpanded((e) => !e)}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label={expanded ? 'Shrink' : 'Expand'}
            >
              {expanded ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
            </button>
            {linkUrl && (
              <a
                href={linkUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                aria-label="Open on Meta"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
            <button
              type="button"
              onClick={onClose}
              className="flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
              aria-label="Close"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto bg-muted/20 relative">
          {loading && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 z-10 bg-muted/30">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="text-xs text-muted-foreground">Rendering ad preview...</span>
            </div>
          )}
          {error ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 p-8">
              <p className="text-sm text-muted-foreground">Preview could not be loaded.</p>
              <button
                type="button"
                onClick={handleRefresh}
                className="text-xs text-primary hover:text-primary/80 transition-colors"
              >
                Try again
              </button>
            </div>
          ) : (
            <img
              key={imgKey}
              src={`${atlasUrl}&fresh=${imgKey > 0 ? 'true' : 'false'}`}
              alt={`Atlas preview of ${adName}`}
              className={cn(
                'w-full h-auto transition-opacity duration-300',
                loading ? 'opacity-0' : 'opacity-100',
              )}
              onLoad={() => setLoading(false)}
              onError={() => { setLoading(false); setError(true) }}
            />
          )}
        </div>
      </div>
    </div>
  )
}
