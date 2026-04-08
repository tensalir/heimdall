'use client'

import { useEffect, useState } from 'react'
import { createSupabaseBrowserClient } from './supabase-auth.js'

export type UserRole = 'admin' | 'user'

const STORAGE_KEY = 'heimdall:user-role'
const PRIVILEGED_STORAGE_KEY = 'heimdall:is-privileged'

const PRIVILEGED_EMAIL_DOMAINS = (
  process.env.NEXT_PUBLIC_HEIMDALL_ALLOWED_EMAIL_DOMAINS || 'thoughtform.co,loopearplugs.com'
)
  .split(',')
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean)

function checkPrivilegedEmail(email: string | undefined): boolean {
  if (!email) return false
  const domain = email.split('@')[1]?.toLowerCase()
  return PRIVILEGED_EMAIL_DOMAINS.includes(domain)
}

/**
 * Reads role from Supabase user_metadata.role.
 * Falls back to 'user' when no Supabase session exists (e.g. cookie-only sheet auth).
 */
export function useUserRole(): UserRole {
  const [role, setRole] = useState<UserRole>(() => {
    if (typeof window === 'undefined') return 'user'
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored === 'admin' || stored === 'user') return stored
    } catch {
      // ignore
    }
    return 'user'
  })

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setRole('user')
      return
    }
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        setRole('user')
        try {
          localStorage.removeItem(STORAGE_KEY)
        } catch {
          // ignore
        }
        return
      }
      const raw = user.user_metadata?.role
      const resolved: UserRole = raw === 'admin' ? 'admin' : 'user'
      setRole(resolved)
      try {
        localStorage.setItem(STORAGE_KEY, resolved)
      } catch {
        // ignore
      }
    })
  }, [])

  return role
}

/**
 * Returns true when the current Supabase user's email domain is in the
 * privileged allow-list (mirrors middleware isPrivilegedUser check).
 * Falls back to false for cookie-only sheet auth (no Supabase session).
 */
export function useIsPrivileged(): boolean {
  const [privileged, setPrivileged] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    try {
      return localStorage.getItem(PRIVILEGED_STORAGE_KEY) === 'true'
    } catch {
      return false
    }
  })

  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    if (!supabase) {
      setPrivileged(false)
      return
    }
    supabase.auth.getUser().then(({ data: { user }, error }) => {
      if (error || !user) {
        setPrivileged(false)
        try { localStorage.removeItem(PRIVILEGED_STORAGE_KEY) } catch { /* ignore */ }
        return
      }
      const result = checkPrivilegedEmail(user.email)
      setPrivileged(result)
      try { localStorage.setItem(PRIVILEGED_STORAGE_KEY, String(result)) } catch { /* ignore */ }
    })
  }, [])

  return privileged
}
