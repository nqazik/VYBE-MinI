import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, DoorOpen, Plus, Settings as SettingsIcon } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { useNotify } from '../components/Notices'
import { Avatar } from '../components/Avatar'
import { ProfileForm } from '../components/ProfileForm'
import { Button, Card, IconButton, Logo } from '../components/ui'
import * as api from '../lib/api'
import { formatCode } from '../lib/code'
import { friendlyError } from '../lib/errors'
import { getLastRoom, setLastRoom } from '../lib/storage'

export function Home() {
  const { settings, hasProfile, update } = useSettings()
  const notify = useNotify()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const lastRoom = getLastRoom()
  const ready = settings.name.trim().length > 0

  const create = async () => {
    setBusy(true)
    try {
      const room = await api.createRoom(settings.name.trim(), settings.avatar)
      setLastRoom(room.code)
      navigate(`/room/${room.code}`)
    } catch (e) {
      notify(friendlyError(e), 'error')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-safe pt-safe">
      <header className="flex items-center justify-between py-4">
        <Logo />
        <IconButton label="Settings" onClick={() => navigate('/settings')}>
          <SettingsIcon className="h-5 w-5" />
        </IconButton>
      </header>

      <section className="animate-fade-up flex flex-1 flex-col justify-center gap-7 pb-10">
        <div className="text-center">
          <div className="mb-4 text-5xl" aria-hidden>
            🍿
          </div>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight">
            Watch together,
            <br />
            <span className="text-gradient">perfectly in sync.</span>
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-muted">
            A cozy private room for you and up to two friends. Paste a YouTube link, press play, and chat while you watch.
          </p>
        </div>

        {!hasProfile || !ready ? (
          <Card className="p-5">
            <h2 className="mb-4 text-lg font-bold">Who’s watching?</h2>
            <ProfileForm name={settings.name} avatar={settings.avatar} onChange={update} />
          </Card>
        ) : (
          <Link to="/settings" className="glass mx-auto flex items-center gap-3 rounded-full py-1.5 pl-1.5 pr-5 transition active:scale-[0.98]">
            <Avatar name={settings.name} avatar={settings.avatar} size={36} />
            <span className="text-sm">
              Hi, <strong>{settings.name}</strong>
            </span>
          </Link>
        )}

        <div className="flex flex-col gap-3">
          <Button size="lg" onClick={create} busy={busy} disabled={!ready} icon={<Plus className="h-5 w-5" />}>
            Create a private room
          </Button>
          <Button size="lg" variant="glass" icon={<DoorOpen className="h-5 w-5" />} type="button" onClick={() => navigate('/join')}>
            Join with a code
          </Button>
          {!ready && <p className="text-center text-xs text-muted">Pick a name first — it’s all you need. No account.</p>}
        </div>

        {lastRoom && ready && (
          <Link
            to={`/room/${lastRoom}`}
            className="glass flex items-center justify-between rounded-2xl px-4 py-3 transition active:scale-[0.99]"
          >
            <span>
              <span className="block text-xs text-muted">Your last room</span>
              <span className="font-mono font-bold tracking-widest">{formatCode(lastRoom)}</span>
            </span>
            <span className="flex items-center gap-1 text-sm font-semibold text-brand-a">
              Rejoin <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        )}
      </section>
    </main>
  )
}
