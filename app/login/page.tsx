'use client'

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase-auth'
import { RunicRain } from '@/components/ui/runic-rain'
import { Shield, Mail, KeyRound, Loader2, AlertCircle } from 'lucide-react'

function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const authError = searchParams.get('error')

  const [mode, setMode] = useState<'magic' | 'password'>('magic')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(authError === 'auth_failed' ? 'Authentication failed. Please try again.' : '')
  const [magicLinkSent, setMagicLinkSent] = useState(false)

  const supabase = createSupabaseBrowserClient()

  if (!supabase) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <RunicRain />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 30%, hsl(0 0% 8% / 0.7) 100%)' }}
        />
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <div className="w-full max-w-sm text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-destructive/10 border border-destructive/20 backdrop-blur-sm">
              <AlertCircle className="h-6 w-6 text-destructive" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Auth Not Configured</h1>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Set <code className="text-xs bg-muted px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_URL</code> and{' '}
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable authentication.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      setMagicLinkSent(true)
    }
  }

  const handlePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    setLoading(false)

    if (error) {
      setError(error.message)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const dest = user?.user_metadata?.role === 'admin' ? '/admin' : '/ops'
      router.push(dest)
      router.refresh()
    }
  }

  if (magicLinkSent) {
    return (
      <div className="relative min-h-screen overflow-hidden">
        <RunicRain />
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'radial-gradient(ellipse at center, transparent 30%, hsl(0 0% 8% / 0.7) 100%)' }}
        />
        <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
          <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl p-8 shadow-2xl text-center">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-primary/10 border border-primary/20">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-2">Check your email</h1>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              We sent a magic link to <span className="font-medium text-foreground">{email}</span>.
              Click the link in the email to sign in.
            </p>
            <button
              onClick={() => setMagicLinkSent(false)}
              className="text-sm text-primary hover:underline"
            >
              Use a different email
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      <RunicRain />

      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at center, transparent 30%, hsl(0 0% 8% / 0.7) 100%)' }}
      />

      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="w-full max-w-sm rounded-2xl border border-border/40 bg-card/60 backdrop-blur-xl p-8 shadow-2xl">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center w-14 h-14 mx-auto mb-4 rounded-2xl bg-card/80 border border-border/60">
              <Shield className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-xl font-semibold text-foreground mb-1">Heimdall</h1>
            <p className="text-sm text-muted-foreground">Sign in to access the admin panel</p>
          </div>

          <div className="flex rounded-lg bg-muted/40 backdrop-blur-sm p-1 mb-6">
            <button
              onClick={() => setMode('magic')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'magic' ? 'bg-card/80 text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              Magic Link
            </button>
            <button
              onClick={() => setMode('password')}
              className={`flex-1 flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                mode === 'password' ? 'bg-card/80 text-foreground shadow-sm' : 'text-muted-foreground'
              }`}
            >
              <KeyRound className="h-3.5 w-3.5" />
              Password
            </button>
          </div>

          {mode === 'magic' ? (
            <form onSubmit={handleMagicLink} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all backdrop-blur-sm"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send magic link'}
              </button>
            </form>
          ) : (
            <form onSubmit={handlePassword} className="space-y-3">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all backdrop-blur-sm"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                required
                className="w-full px-4 py-2.5 rounded-lg border border-border/50 bg-background/50 text-foreground text-sm placeholder:text-muted-foreground/40 outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all backdrop-blur-sm"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign in'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>}>
      <LoginForm />
    </Suspense>
  )
}
