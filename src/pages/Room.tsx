import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, Copy, ListVideo, LogOut, MessageCircle, Users, WifiOff } from 'lucide-react'
import { useSession } from '../hooks/useSession'
import { useSettings } from '../hooks/useSettings'
import { useRoom } from '../hooks/useRoom'
import { useVoice } from '../hooks/useVoice'
import { useNotify } from '../components/Notices'
import { AddVideo } from '../components/AddVideo'
import { Chat } from '../components/Chat'
import { People } from '../components/People'
import { Player } from '../components/Player'
import { Queue } from '../components/Queue'
import { VoiceBar } from '../components/VoiceBar'
import { Button, IconButton, Spinner } from '../components/ui'
import * as api from '../lib/api'
import { formatCode, inviteLink, normalizeCode } from '../lib/code'
import { friendlyError } from '../lib/errors'
import { playbackFromRow } from '../lib/sync'
import { setLastRoom } from '../lib/storage'
import type { QueueItem } from '../lib/types'

type Tab = 'chat' | 'queue' | 'people'

/** Guard: a name is required before joining, so send people without one to the Join screen. */
export function Room() {
  const { code: raw = '' } = useParams()
  const { hasProfile } = useSettings()
  const code = normalizeCode(raw)
  if (!hasProfile) return <Navigate to={`/join/${code}`} replace />
  return <RoomView key={code} code={code} />
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Older browsers / non-secure contexts: fall back to a hidden textarea.
    try {
      const ta = document.createElement('textarea')
      ta.value = text
      ta.setAttribute('readonly', '')
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      return false
    }
  }
}

function RoomView({ code }: { code: string }) {
  const { user } = useSession()
  const { settings } = useSettings()
  const notify = useNotify()
  const navigate = useNavigate()
  const meId = user?.id ?? ''

  const state = useRoom(code, user?.id, { name: settings.name.trim(), avatar: settings.avatar })
  const { room, members, messages, queue, online, connection, clock } = state
  const voice = useVoice(room?.id)

  const [tab, setTab] = useState<Tab | null>(null)
  const [seenMessages, setSeenMessages] = useState(0)

  const isHost = !!room && room.host_id === meId
  const playback = useMemo(
    () => (room ? playbackFromRow(room) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [room?.video_id, room?.is_playing, room?.position_sec, room?.state_updated_at, room?.state_seq],
  )

  // Remember this room so Home can offer "Rejoin".
  useEffect(() => {
    if (state.status === 'ready') setLastRoom(code)
  }, [state.status, code])

  // First tab: chat once something is playing; otherwise the queue (where the link box is on phones).
  const activeTab: Tab = tab ?? (room?.video_id ? 'chat' : 'queue')

  // Messages you've already looked at don't count as unread.
  useEffect(() => {
    if (activeTab === 'chat') setSeenMessages(messages.length)
  }, [activeTab, messages.length])
  const unread = activeTab === 'chat' ? 0 : messages.slice(seenMessages).filter((m) => m.user_id !== meId).length

  const fail = useCallback((e: unknown) => notify(friendlyError(e), 'error'), [notify])

  // ---- host actions ---------------------------------------------------------------------------
  const roomId = room?.id ?? ''
  const command = useCallback(
    (playing: boolean, position: number) => {
      api.setPlayback(roomId, playing, position).then(state.applyRoom).catch(fail)
    },
    [roomId, state.applyRoom, fail],
  )

  const playNow = useCallback(
    async (videoId: string, title: string | null) => {
      try {
        state.applyRoom(await api.loadVideo(roomId, videoId, title))
      } catch (e) {
        fail(e)
        throw e
      }
    },
    [roomId, state.applyRoom, fail],
  )

  const playNext = useCallback(() => {
    api
      .playNext(roomId)
      .then((r) => {
        state.applyRoom(r)
        state.refreshQueue()
      })
      .catch(fail)
  }, [roomId, state.applyRoom, state.refreshQueue, fail])

  const playItem = useCallback(
    (item: QueueItem) => {
      api
        .playQueueItem(item.id)
        .then((r) => {
          state.applyRoom(r)
          state.refreshQueue()
        })
        .catch(fail)
    },
    [state.applyRoom, state.refreshQueue, fail],
  )

  // When a video ends on the host's device: continue with the queue, or park at the end.
  const lastEndedSeq = useRef(-1)
  const queueLength = queue.length
  const onEnded = useCallback(
    (duration: number) => {
      if (!room || lastEndedSeq.current === room.state_seq) return
      lastEndedSeq.current = room.state_seq
      if (queueLength > 0) playNext()
      else command(false, duration)
    },
    [room, queueLength, playNext, command],
  )

  // ---- everyone's actions -------------------------------------------------------------------------
  const addToQueue = useCallback(
    async (videoId: string, title: string | null) => {
      try {
        await api.addToQueue(roomId, meId, videoId, title)
        state.refreshQueue()
        notify('Added to the queue', 'success')
        setTab((t) => t ?? 'queue')
      } catch (e) {
        fail(e)
        throw e
      }
    },
    [roomId, meId, state, notify, fail],
  )

  const removeItem = useCallback(
    (item: QueueItem) => {
      api.removeFromQueue(item.id).then(state.refreshQueue).catch(fail)
    },
    [state.refreshQueue, fail],
  )

  const sendMessage = useCallback(
    async (body: string) => {
      try {
        state.addMessage(await api.sendMessage(roomId, meId, body))
      } catch (e) {
        fail(e)
        throw e
      }
    },
    [roomId, meId, state, fail],
  )

  const onTitle = useCallback(
    (videoId: string, title: string) => {
      api.setVideoTitle(roomId, videoId, title).catch(() => {})
    },
    [roomId],
  )

  const copyInvite = useCallback(async () => {
    const ok = await copyText(inviteLink(code, window.location.origin))
    notify(ok ? 'Invitation link copied. Send it to a friend!' : `Couldn't copy. The code is ${formatCode(code)}`, ok ? 'success' : 'error')
  }, [code, notify])

  const shareInvite = useMemo(() => {
    if (typeof navigator === 'undefined' || typeof navigator.share !== 'function') return undefined
    return () => {
      void navigator
        .share({ title: 'Watch with me on VYBE Mini', text: `Join my room: ${formatCode(code)}`, url: inviteLink(code, window.location.origin) })
        .catch(() => {})
    }
  }, [code])

  const leave = useCallback(async () => {
    if (!window.confirm('Leave this room? You can come back with the code while there is a free seat.')) return
    voice.leave()
    try {
      await api.leaveRoom(roomId)
    } catch (e) {
      fail(e)
      return
    }
    setLastRoom(null)
    navigate('/', { replace: true })
  }, [roomId, voice, fail, navigate])

  // ---- screens for the non-ready states --------------------------------------------------------------
  if (state.status === 'joining') {
    return (
      <main className="grid min-h-dvh place-items-center">
        <Spinner label="Joining the room…" />
      </main>
    )
  }
  if (state.status === 'error' || !room || !playback) {
    return (
      <main className="grid min-h-dvh place-items-center px-6">
        <div className="animate-fade-up glass max-w-sm space-y-4 rounded-3xl p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-300" />
          <h1 className="text-xl font-bold">Can’t open this room</h1>
          <p className="text-sm text-muted">{state.error ?? 'Something went wrong.'}</p>
          <div className="flex justify-center gap-2">
            <Button variant="glass" onClick={() => navigate('/')}>
              Home
            </Button>
            <Button onClick={() => window.location.reload()}>Try again</Button>
          </div>
        </div>
      </main>
    )
  }

  const hostOnline = online.has(room.host_id)
  const canClaimHost = !isHost && online.size > 0 && !hostOnline

  const addVideo = <AddVideo isHost={isHost} notify={notify} onPlayNow={playNow} onQueue={addToQueue} />

  const tabs: { id: Tab; label: string; icon: ReactNode; badge?: number }[] = [
    { id: 'chat', label: 'Chat', icon: <MessageCircle className="h-4 w-4" />, badge: unread },
    { id: 'queue', label: 'Queue', icon: <ListVideo className="h-4 w-4" />, badge: queue.length },
    { id: 'people', label: 'People', icon: <Users className="h-4 w-4" />, badge: members.length },
  ]

  return (
    <div className="mx-auto flex h-dvh w-full max-w-[1500px] flex-col lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-5 lg:p-5">
      {/* ---------- left: header + player ---------- */}
      <div className="flex shrink-0 flex-col lg:min-h-0 lg:overflow-y-auto lg:pr-1">
        <header className="flex items-center gap-1.5 px-2 pb-2 pt-safe max-lg:pt-[max(env(safe-area-inset-top),8px)] lg:px-0 lg:pt-0">
          <IconButton label="Back to home" onClick={() => navigate('/')}>
            <ArrowLeft className="h-5 w-5" />
          </IconButton>
          <button
            onClick={copyInvite}
            title="Copy invitation link"
            className="glass flex h-10 min-w-0 items-center gap-2 rounded-full px-3.5 transition active:scale-95"
          >
            <span className="font-mono text-sm font-bold tracking-widest">{formatCode(code)}</span>
            <Copy className="h-3.5 w-3.5 text-muted" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            <VoiceBar voice={voice} />
            <IconButton label="Leave room" onClick={leave}>
              <LogOut className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        {connection === 'reconnecting' && (
          <div className="mx-3 mb-2 flex items-center gap-2 rounded-2xl bg-amber-400/15 px-3 py-2 text-xs text-amber-200 ring-1 ring-amber-300/30 lg:mx-0" role="status">
            <WifiOff className="h-4 w-4 shrink-0" /> Connection lost — reconnecting. We’ll catch you up automatically.
          </div>
        )}

        <Player
          playback={playback}
          clock={clock}
          isHost={isHost}
          title={room.video_title}
          onCommand={command}
          onEnded={onEnded}
          onTitle={onTitle}
          onSkip={queue.length > 0 ? playNext : undefined}
        />

        <div className="px-4 py-3 lg:px-1">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">
            {room.video_id ? 'Now playing' : 'Ready when you are'}
          </p>
          <p className="line-clamp-2 text-base font-semibold leading-snug">
            {room.video_id ? (room.video_title ?? 'YouTube video') : isHost ? 'Add a video to begin' : 'Waiting for the host to pick a video'}
          </p>
        </div>

        {/* On big screens the paste box lives under the player; on phones it's inside the Queue tab. */}
        <div className="hidden lg:block">{addVideo}</div>
      </div>

      {/* ---------- right: chat / queue / people ---------- */}
      <section className="glass flex min-h-0 flex-1 flex-col overflow-hidden max-lg:rounded-b-none max-lg:rounded-t-3xl lg:rounded-3xl">
        <nav className="flex shrink-0 gap-1 border-b border-line p-1.5" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 items-center justify-center gap-1.5 rounded-full py-2 text-sm font-semibold transition ${
                activeTab === t.id ? 'bg-brand text-white shadow-md shadow-[color:var(--glow-a)]' : 'text-muted hover:text-ink'
              }`}
            >
              {t.icon}
              {t.label}
              {t.badge ? (
                <span
                  className={`rounded-full px-1.5 text-[11px] leading-5 ${
                    t.id === 'chat' ? 'bg-rose-500 text-white' : activeTab === t.id ? 'bg-white/25' : 'bg-surface-2'
                  }`}
                >
                  {t.badge}
                </span>
              ) : null}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1" role="tabpanel">
          {activeTab === 'chat' && <Chat messages={messages} meId={meId} onSend={sendMessage} />}
          {activeTab === 'queue' && (
            <div className="flex h-full min-h-0 flex-col">
              <div className="shrink-0 p-3 lg:hidden">{addVideo}</div>
              <div className="min-h-0 flex-1">
                <Queue items={queue} meId={meId} isHost={isHost} onPlayNext={playNext} onPlayItem={playItem} onRemove={removeItem} />
              </div>
            </div>
          )}
          {activeTab === 'people' && (
            <People
              members={members}
              online={online}
              speaking={voice.speaking}
              hostId={room.host_id}
              meId={meId}
              maxMembers={room.max_members}
              code={code}
              canClaimHost={canClaimHost}
              onTransferHost={(id) => api.transferHost(room.id, id).catch(fail)}
              onClaimHost={() => api.claimHost(room.id).then(state.applyRoom).catch(fail)}
              onCopyInvite={copyInvite}
              onShareInvite={shareInvite}
            />
          )}
        </div>
        {voice.error && <p className="shrink-0 border-t border-line px-4 py-2 text-xs text-amber-200">{voice.error}</p>}
      </section>
    </div>
  )
}
