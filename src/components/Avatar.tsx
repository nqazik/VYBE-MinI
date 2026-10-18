import { avatarGradient } from '../lib/avatars'

interface Props {
  name: string
  avatar: string
  size?: number
  /** Show a green/grey presence dot. Leave undefined to hide it. */
  online?: boolean
  /** Glowing ring while that person is talking (voice chat). */
  speaking?: boolean
}

export function Avatar({ name, avatar, size = 40, online, speaking }: Props) {
  return (
    <span className="relative inline-block shrink-0" style={{ width: size, height: size }}>
      <span
        className={`grid h-full w-full place-items-center rounded-full transition ${
          speaking ? 'ring-[3px] ring-emerald-400 ring-offset-2 ring-offset-[color:var(--bg)]' : 'ring-1 ring-white/15'
        }`}
        style={{ background: avatarGradient(name + avatar), fontSize: size * 0.52, lineHeight: 1 }}
        role="img"
        aria-label={`${name}'s avatar`}
      >
        {avatar}
      </span>
      {online !== undefined && (
        <span
          className={`absolute bottom-0 right-0 block rounded-full border-2 border-[color:var(--bg)] ${
            online ? 'bg-emerald-400' : 'bg-slate-500'
          }`}
          style={{ width: Math.max(10, size * 0.28), height: Math.max(10, size * 0.28) }}
          title={online ? 'Here now' : 'Away'}
        />
      )}
    </span>
  )
}
