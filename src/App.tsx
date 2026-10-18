import type { ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { SettingsProvider } from './hooks/useSettings'
import { SessionProvider, useSession } from './hooks/useSession'
import { NoticeProvider } from './components/Notices'
import { Backdrop, Button, Spinner } from './components/ui'
import { isConfigured } from './lib/config'
import { Home } from './pages/Home'
import { Join } from './pages/Join'
import { Room } from './pages/Room'
import { Settings } from './pages/Settings'
import { Setup } from './pages/Setup'

/** Waits for the (anonymous) sign-in before any screen that talks to the database. */
function SessionGate({ children }: { children: ReactNode }) {
  const { status, error, retry } = useSession()

  if (status === 'loading') {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="Getting things ready…" />
      </main>
    )
  }
  if (status === 'error') {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="glass max-w-sm space-y-4 rounded-3xl p-6 text-center">
          <h1 className="text-xl font-bold">Couldn’t connect</h1>
          <p className="text-sm text-muted">{error}</p>
          <Button onClick={retry}>Try again</Button>
        </div>
      </main>
    )
  }
  return <>{children}</>
}

export default function App() {
  return (
    <SettingsProvider>
      <Backdrop />
      {!isConfigured ? (
        <Setup />
      ) : (
        <NoticeProvider>
          <SessionProvider>
            <BrowserRouter>
              <SessionGate>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/join" element={<Join />} />
                  <Route path="/join/:code" element={<Join />} />
                  <Route path="/room/:code" element={<Room />} />
                  <Route path="/settings" element={<Settings />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </SessionGate>
            </BrowserRouter>
          </SessionProvider>
        </NoticeProvider>
      )}
    </SettingsProvider>
  )
}
