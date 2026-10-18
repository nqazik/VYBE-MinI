import { Copy, Crown, Share2 } from 'lucide-react'
import type { Member } from '../lib/types'
import { formatCode, inviteLink } from '../lib/code'
import { Avatar } from './Avatar'

interface Props {
  members: Member[]
  online: Set<string>
  speaking: Set<string>
  hostId: string
  meId: string
  maxMembers: number
  code: string
  /** The host has been away - anyone may ask to take the remote. */
  canClaimHost: boolean
  onTransferHost: (userId: string) => void
  onClaimHost: () => void
  onCopyInvite: () => void
  onShareInvite?: () => void
}

export function People(props: Props) {
  const { members, online, speaking, hostId, meId, maxMembers, code, canClaimHost } = props
  const iAmHost = hostId === meId
  const seatsLeft = Math.max(0, maxMembers - members.length)

  return (
    <div className="h-full space-y-5 overflow-y-auto p-4">
      <section>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
          In this room · {members.length} of {maxMembers}
        </p>
        <ul className="space-y-2">
          {members.map((m) => (
            <li key={m.user_id} className="flex items-center gap-3 rounded-2xl bg-surface p-3 ring-1 ring-line">
              <Avatar name={m.name} avatar={m.avatar} size={44} online={online.has(m.user_id)} speaking={speaking.has(m.user_id)} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold">
                  {m.name}
                  {m.user_id === meId && <span className="ml-1.5 text-xs font-normal text-muted">(you)</span>}
                </p>
                <p className="text-xs text-muted">
                  {m.user_id === hostId ? (
                    <span className="inline-flex items-center gap-1 text-amber-300">
                      <Crown className="h-3 w-3" /> Host
                    </span>
                  ) : online.has(m.user_id) ? (
                    'Here now'
                  ) : (
                    'Away'
                  )}
                </p>
              </div>
              {iAmHost && m.user_id !== meId && (
                <button
                  onClick={() => props.onTransferHost(m.user_id)}
                  className="rounded-full bg-surface-2 px-3 py-1.5 text-xs font-semibold text-ink hover:brightness-110 active:scale-95"
                >
                  Make host
                </button>
              )}
            </li>
          ))}
          {Array.from({ length: seatsLeft }).map((_, i) => (
            <li key={`free-${i}`} className="flex items-center gap-3 rounded-2xl border border-dashed border-line p-3 text-sm text-muted">
              <span className="grid h-11 w-11 place-items-center rounded-full bg-surface text-lg">＋</span>
              Seat open — invite a friend
            </li>
          ))}
        </ul>

        {canClaimHost && (
          <button
            onClick={props.onClaimHost}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-amber-400/15 px-4 py-3 text-sm font-semibold text-amber-200 ring-1 ring-amber-300/30 active:scale-[0.99]"
          >
            <Crown className="h-4 w-4" /> The host seems to be away — take the remote
          </button>
        )}
      </section>

      <section className="rounded-3xl bg-surface p-4 ring-1 ring-line">
        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Invite friends</p>
        <p className="font-mono text-2xl font-bold tracking-widest text-gradient">{formatCode(code)}</p>
        <p className="mt-1 break-all text-xs text-muted">{inviteLink(code, window.location.origin)}</p>
        <div className="mt-3 flex gap-2">
          <button
            onClick={props.onCopyInvite}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-md shadow-[color:var(--glow-a)] active:scale-[0.98]"
          >
            <Copy className="h-4 w-4" /> Copy invitation
          </button>
          {props.onShareInvite && (
            <button
              onClick={props.onShareInvite}
              aria-label="Share invitation"
              className="grid h-11 w-11 place-items-center rounded-full bg-surface-2 active:scale-95"
            >
              <Share2 className="h-4 w-4" />
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">Anyone with this link or code can join, up to {maxMembers} people. Only share it with friends.</p>
      </section>
    </div>
  )
}
