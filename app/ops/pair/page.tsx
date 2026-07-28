'use client'

/**
 * Approval screen for the Figma plugin's device-pairing flow.
 *
 * Lives under /ops so any signed-in user can pair their own plugin — the
 * whole point is that each person gets their own credential rather than
 * sharing the one baked into the bundle. Middleware has already established
 * the session by the time this renders.
 */

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Check, Loader2, Plug, TriangleAlert } from 'lucide-react'

const INPUT_CLASS =
  'w-full px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm ' +
  'placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 ' +
  'focus:border-primary/50 transition-all font-mono tracking-widest text-center uppercase'

export default function PairPluginPage() {
  const [code, setCode] = useState('')
  const [state, setState] = useState<'idle' | 'submitting' | 'done'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [approvedFor, setApprovedFor] = useState<string | null>(null)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (state === 'submitting') return
    setState('submitting')
    setError(null)
    try {
      const res = await fetch('/api/pairings/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: code }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error ?? 'Could not approve that code.')
        setState('idle')
        return
      }
      setApprovedFor(json.email ?? null)
      setState('done')
    } catch {
      setError('Network error. Try again.')
      setState('idle')
    }
  }

  if (state === 'done') {
    return (
      <Card className="max-w-md mx-auto mt-12">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Check className="h-4 w-4 text-emerald-500" />
            Plugin connected
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            The plugin now acts as{' '}
            <span className="text-foreground font-medium">{approvedFor ?? 'your account'}</span>.
            You can close this tab and return to Figma.
          </p>
          <p className="text-xs">
            This connection is yours alone and can be revoked without affecting anyone else.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="max-w-md mx-auto mt-12">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Plug className="h-4 w-4 text-muted-foreground" />
          Connect the Figma plugin
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-4">
          Enter the code shown in the plugin. It expires after ten minutes.
        </p>
        <form onSubmit={submit} className="space-y-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="XXXX-XXXX"
            aria-label="Pairing code"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            maxLength={9}
            className={INPUT_CLASS}
          />
          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
              <TriangleAlert className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          <Button type="submit" className="w-full" disabled={state === 'submitting' || code.trim().length < 8}>
            {state === 'submitting' ? (
              <>
                <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                Approving…
              </>
            ) : (
              'Approve'
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
