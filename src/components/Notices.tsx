import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { AlertCircle, CheckCircle2, Info } from 'lucide-react'
import type { NoticeKind, Notify } from '../lib/types'

interface Notice {
  id: number
  message: string
  kind: NoticeKind
}

const NoticeContext = createContext<Notify | null>(null)

/** Small toast messages at the top of the screen. */
export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notices, setNotices] = useState<Notice[]>([])
  const nextId = useRef(1)

  const notify = useCallback<Notify>((message, kind = 'info') => {
    const id = nextId.current++
    setNotices((list) => [...list.slice(-2), { id, message, kind }])
    window.setTimeout(() => setNotices((list) => list.filter((n) => n.id !== id)), kind === 'error' ? 5500 : 3200)
  }, [])

  const value = useMemo(() => notify, [notify])

  return (
    <NoticeContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-4 pt-safe"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 12px)' }}
        aria-live="polite"
      >
        {notices.map((n) => (
          <div
            key={n.id}
            className="animate-pop glass pointer-events-auto flex max-w-md items-center gap-2.5 rounded-2xl px-4 py-3 text-sm shadow-xl backdrop-blur-xl"
            style={{ backgroundColor: 'color-mix(in oklab, var(--bg) 82%, transparent)' }}
          >
            {n.kind === 'error' ? (
              <AlertCircle className="h-5 w-5 shrink-0 text-rose-400" />
            ) : n.kind === 'success' ? (
              <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
            ) : (
              <Info className="h-5 w-5 shrink-0 text-brand-a" />
            )}
            <span>{n.message}</span>
          </div>
        ))}
      </div>
    </NoticeContext.Provider>
  )
}

export function useNotify(): Notify {
  const ctx = useContext(NoticeContext)
  if (!ctx) throw new Error('useNotify must be used inside <NoticeProvider>')
  return ctx
}
