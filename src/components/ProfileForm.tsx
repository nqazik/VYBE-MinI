import { AVATARS } from '../lib/avatars'
import { Avatar } from './Avatar'

interface Props {
  name: string
  avatar: string
  onChange: (patch: { name?: string; avatar?: string }) => void
  autoFocusName?: boolean
}

/** Display name + avatar picker. Used on Home, Join and Settings. */
export function ProfileForm({ name, avatar, onChange, autoFocusName }: Props) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <Avatar name={name || '?'} avatar={avatar} size={64} />
        <label className="block min-w-0 flex-1">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted">Your name</span>
          <input
            value={name}
            onChange={(e) => onChange({ name: e.target.value.slice(0, 24) })}
            placeholder="What should friends call you?"
            maxLength={24}
            autoFocus={autoFocusName}
            autoComplete="nickname"
            className="w-full rounded-2xl border border-line bg-surface px-4 py-3 text-ink placeholder:text-muted/70 focus:border-brand-a focus:outline-none"
          />
        </label>
      </div>
      <div>
        <span className="mb-2 block text-xs font-semibold uppercase tracking-wider text-muted">Pick an avatar</span>
        <div className="grid grid-cols-8 gap-2 max-sm:grid-cols-4" role="radiogroup" aria-label="Avatar">
          {AVATARS.map((a) => (
            <button
              key={a}
              type="button"
              role="radio"
              aria-checked={a === avatar}
              aria-label={a}
              onClick={() => onChange({ avatar: a })}
              className={`grid aspect-square place-items-center rounded-2xl text-2xl transition active:scale-90 ${
                a === avatar ? 'bg-brand shadow-lg shadow-[color:var(--glow-a)]' : 'bg-surface ring-1 ring-line hover:bg-surface-2'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
