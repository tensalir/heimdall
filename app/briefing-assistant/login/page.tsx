'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Lock, Loader2 } from 'lucide-react'
import { Suspense } from 'react'

function BriefingLoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/briefing-assistant'

  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    try {
      const res = await fetch('/api/briefing-assistant/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })

      if (res.ok) {
        router.push(redirect)
        router.refresh()
      } else {
        const data = await res.json()
        setError(data.error || 'Invalid password')
      }
    } catch {
      setError('Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex items-center justify-center bg-background">
      <div className="w-full max-w-sm mx-4">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-card border border-border">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <h1 className="text-xl font-bold tracking-[0.2em] uppercase text-foreground mb-0.5">
            MIMIR
          </h1>
          <p className="text-[9px] font-semibold tracking-[0.35em] uppercase text-muted-foreground/60 mb-2">
            BRIEFING ASSISTANT
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Enter the local development password to continue.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoFocus
            className="w-full px-4 py-2.5 rounded-lg border border-border bg-card text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all"
          />
          {error && (
            <p className="text-xs text-destructive">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continue'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function BriefingLoginPage() {
  return (
    <Suspense fallback={<div className="h-full flex items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>}>
      <BriefingLoginForm />
    </Suspense>
  )
}
