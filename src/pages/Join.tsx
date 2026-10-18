import { useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, LogIn } from 'lucide-react'
import { useSettings } from '../hooks/useSettings'
import { useNotify } from '../components/Notices'
import { ProfileForm } from '../components/ProfileForm'
import { Button, Card, IconButton, Logo } from '../components/ui'
import * as api from '../lib/api'
import { extractCode, formatCode, isValidCode } from '../lib/code'
import { friendlyError } from '../lib/errors'
import { setLastRoom } from '../lib/storage'

/** Enter a code, or arrive here from an invitation link (/join/ABCDE-FGHJK). */
export function Join() {
  const { code: linkCode } = useParams()
  const { settings, update } = useSettings()
  const notify = useNotify()
  const navigate = useNavigate()
  const [code, setCode] = useState(() => extractCode(linkCode ?? ''))
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)

  const nameOk = settings.name.trim().length > 0
  const codeOk = isValidCode(code)

  const join = async (e: FormEvent) => {
    e.preventDefault()
    if (!nameOk || !codeOk) return
    setBusy(true)
    setProblem(null)
    try {
      const room = await api.joinRoom(code, settings.name.trim(), settings.avatar)
      setLastRoom(room.code)
      navigate(`/room/${room.code}`, { replace: true })
    } catch (err) {
      const message = friendlyError(err)
      setProblem(message)
      notify(message, 'error')
      setBusy(false)
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-safe pt-safe">
      <header className="flex items-center gap-2 py-4">
        <IconButton label="Back" onClick={() => navigate('/')}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <Logo />
      </header>

      <form onSubmit={join} className="animate-fade-up flex flex-1 flex-col justify-center gap-5 pb-10">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">{linkCode ? 'You’re invited 🎉' : 'Join a room'}</h1>
          <p className="mt-1 text-muted">
            {linkCode ? 'Check your name, then hop in.' : 'Paste the invitation link or type the room code.'}
          </p>
        </div>

        <Card className="p-5">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Room code or link</span>
            <input
              value={formatCode(code)}
              onChange={(e) => {
                setCode(extractCode(e.target.value))
                setProblem(null)
              }}
              onPaste={(e) => {
                // Pasting a whole invitation link is the common case.
                const text = e.clipboardData.getData('text')
                if (text) {
                  e.preventDefault()
                  setCode(extractCode(text))
                  setProblem(null)
                }
              }}
              placeholder="ABCDE-FGHJK"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="off"
              className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-center font-mono text-2xl font-bold uppercase tracking-[0.25em] text-ink placeholder:text-muted/50 focus:border-brand-a focus:outline-none"
            />
          </label>
          {problem && <p className="mt-3 text-sm text-rose-300">{problem}</p>}
        </Card>

        <Card className="p-5">
          <ProfileForm name={settings.name} avatar={settings.avatar} onChange={update} autoFocusName={!nameOk && codeOk} />
        </Card>

        <Button size="lg" type="submit" busy={busy} disabled={!nameOk || !codeOk} icon={<LogIn className="h-5 w-5" />}>
          Join room
        </Button>
      </form>
    </main>
  )
}
