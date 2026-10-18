import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from 'lucide-react'
import { THEMES, useSettings } from '../hooks/useSettings'
import { Card, IconButton } from '../components/ui'
import { ProfileForm } from '../components/ProfileForm'

export function Settings() {
  const { settings, update } = useSettings()
  const navigate = useNavigate()

  return (
    <main className="mx-auto min-h-dvh w-full max-w-lg px-5 pb-safe pt-safe">
      <header className="flex items-center gap-2 py-4">
        <IconButton label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ArrowLeft className="h-5 w-5" />
        </IconButton>
        <h1 className="text-xl font-bold">Settings</h1>
      </header>

      <div className="animate-fade-up space-y-5 pb-10">
        <Card className="p-5">
          <h2 className="mb-4 font-bold">You</h2>
          <ProfileForm name={settings.name} avatar={settings.avatar} onChange={update} />
          <p className="mt-4 text-xs text-muted">Saved on this device. Friends see your new name and avatar next time you open a room.</p>
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 font-bold">Theme</h2>
          <div className="space-y-2" role="radiogroup" aria-label="Theme">
            {THEMES.map((t) => {
              const active = t.id === settings.theme
              return (
                <button
                  key={t.id}
                  role="radio"
                  aria-checked={active}
                  onClick={() => update({ theme: t.id })}
                  className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition active:scale-[0.99] ${
                    active ? 'bg-surface-2 ring-2 ring-brand-a' : 'bg-surface ring-1 ring-line hover:bg-surface-2'
                  }`}
                >
                  <span
                    className="h-10 w-10 shrink-0 rounded-xl"
                    style={{ background: `linear-gradient(135deg, ${t.swatch[0]}, ${t.swatch[1]})` }}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold">{t.label}</span>
                    <span className="block text-xs text-muted">{t.blurb}</span>
                  </span>
                  {active && <Check className="h-5 w-5 text-brand-a" />}
                </button>
              )
            })}
          </div>
        </Card>
      </div>
    </main>
  )
}
