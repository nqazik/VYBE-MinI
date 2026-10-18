import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'

type Status = 'loading' | 'ready' | 'error'

interface SessionContextValue {
  user: User | null
  status: Status
  error: string | null
  retry: () => void
}

const SessionContext = createContext<SessionContextValue | null>(null)

/**
 * Gives every visitor a real (anonymous) Supabase user without any sign-up form.
 * The session is stored in the browser, so the same phone keeps the same identity
 * (and can re-enter its rooms) until its site data is cleared.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [status, setStatus] = useState<Status>('loading')
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false

    async function start() {
      setStatus('loading')
      setError(null)
      const { data } = await supabase.auth.getSession()
      let current = data.session?.user ?? null
      if (!current) {
        const res = await supabase.auth.signInAnonymously()
        if (res.error) throw res.error
        current = res.data.user
      }
      if (!cancelled) {
        setUser(current)
        setStatus('ready')
      }
    }

    start().catch((e: unknown) => {
      if (cancelled) return
      setError(friendlyError(e))
      setStatus('error')
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) setUser(session.user)
    })
    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])
  const value = useMemo(() => ({ user, status, error, retry }), [user, status, error, retry])
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext)
  if (!ctx) throw new Error('useSession must be used inside <SessionProvider>')
  return ctx
}
