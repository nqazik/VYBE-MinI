import { useCallback, useEffect, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import * as api from '../lib/api'
import { ServerClock } from '../lib/clock'
import { friendlyError } from '../lib/errors'
import { isValidCode } from '../lib/code'
import type { ChatMessage, Member, QueueItem, Room } from '../lib/types'

export type RoomStatus = 'joining' | 'ready' | 'error'
export type Connection = 'connected' | 'reconnecting'

interface Profile {
  name: string
  avatar: string
}

export interface RoomState {
  status: RoomStatus
  error: string | null
  room: Room | null
  members: Member[]
  messages: ChatMessage[]
  queue: QueueItem[]
  /** user ids currently connected to the room channel (realtime presence) */
  online: Set<string>
  connection: Connection
  clock: ServerClock
  /** Accept a room row returned by an RPC straight away (realtime will confirm it moments later). */
  applyRoom: (row: Room) => void
  addMessage: (m: ChatMessage) => void
  refreshQueue: () => void
}

/** Never let an older database row overwrite a newer one (realtime and RPC replies can arrive out of order). */
function newerRoom(prev: Room | null, next: Room): Room {
  if (!prev || prev.id !== next.id) return next
  if (Number(next.state_seq) < Number(prev.state_seq)) {
    // Playback fields are stale, but host / title may still be fresh.
    return {
      ...prev,
      host_id: next.host_id,
      video_title: prev.video_id === next.video_id ? (next.video_title ?? prev.video_title) : prev.video_title,
    }
  }
  return next
}

/**
 * Everything a room screen needs: joins the room, loads its data, keeps it live through
 * Supabase Realtime, tracks who is online, and heals itself after a dropped connection.
 * All listeners and timers are removed when the person leaves the screen.
 */
export function useRoom(code: string, userId: string | undefined, profile: Profile): RoomState {
  const [status, setStatus] = useState<RoomStatus>('joining')
  const [error, setError] = useState<string | null>(null)
  const [room, setRoom] = useState<Room | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])
  const [online, setOnline] = useState<Set<string>>(new Set())
  const [connection, setConnection] = useState<Connection>('connected')
  const clockRef = useRef<ServerClock>(new ServerClock())

  const roomId = room?.id
  const profileRef = useRef(profile)
  profileRef.current = profile

  // ---- 1. join (idempotent) ---------------------------------------------------------------
  useEffect(() => {
    if (!userId) return
    let cancelled = false
    setStatus('joining')
    setError(null)

    if (!isValidCode(code)) {
      setError("That invitation code doesn't look right.")
      setStatus('error')
      return
    }

    ;(async () => {
      const joined = await api.joinRoom(code, profileRef.current.name, profileRef.current.avatar)
      const [r, m, msgs, q] = await Promise.all([
        api.fetchRoom(joined.id),
        api.fetchMembers(joined.id),
        api.fetchMessages(joined.id),
        api.fetchQueue(joined.id),
      ])
      if (cancelled) return
      setRoom(r)
      setMembers(m)
      setMessages(msgs)
      setQueue(q)
      setStatus('ready')
      void clockRef.current.sync(api.serverTime)
    })().catch((e: unknown) => {
      if (cancelled) return
      setError(friendlyError(e))
      setStatus('error')
    })

    return () => {
      cancelled = true
    }
  }, [code, userId])

  // ---- 2. keep my name / avatar current ----------------------------------------------------
  const lastProfile = useRef(`${profile.name}|${profile.avatar}`)
  useEffect(() => {
    const key = `${profile.name}|${profile.avatar}`
    if (status !== 'ready' || key === lastProfile.current) return
    lastProfile.current = key
    api.joinRoom(code, profile.name, profile.avatar).catch(() => {})
  }, [status, code, profile.name, profile.avatar])

  // ---- 3. refetch helpers ---------------------------------------------------------------------
  const refreshMembers = useCallback(() => {
    if (!roomId) return
    api.fetchMembers(roomId).then(setMembers).catch(() => {})
  }, [roomId])

  const refreshQueue = useCallback(() => {
    if (!roomId) return
    api.fetchQueue(roomId).then(setQueue).catch(() => {})
  }, [roomId])

  const refreshAll = useCallback(() => {
    if (!roomId) return
    api
      .fetchRoom(roomId)
      .then((r) => setRoom((prev) => newerRoom(prev, r)))
      .catch(() => {})
    refreshMembers()
    refreshQueue()
    api
      .fetchMessages(roomId)
      .then((fresh) =>
        setMessages((prev) => {
          const ids = new Set(fresh.map((m) => m.id))
          const extra = prev.filter((m) => !ids.has(m.id) && m.created_at > (fresh.at(-1)?.created_at ?? ''))
          return [...fresh, ...extra]
        }),
      )
      .catch(() => {})
  }, [roomId, refreshMembers, refreshQueue])

  // ---- 4. realtime subscription -------------------------------------------------------------
  useEffect(() => {
    if (!roomId || !userId) return

    const channel: RealtimeChannel = supabase.channel(`room:${roomId}`, {
      config: { presence: { key: userId } },
    })
    let hasConnectedBefore = false

    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}` }, (p) => {
        setRoom((prev) => newerRoom(prev, p.new as Room))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (p) => {
        const m = p.new as ChatMessage
        setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]))
      })
      // Members & queue are tiny (<= 3 people, <= 30 videos): on any change simply re-read them.
      // DELETE events cannot be filtered by Supabase Realtime, so they are unfiltered and merely trigger a re-read.
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, refreshMembers)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'room_members', filter: `room_id=eq.${roomId}` }, refreshMembers)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_members' }, refreshMembers)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'queue_items', filter: `room_id=eq.${roomId}` }, refreshQueue)
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'queue_items' }, refreshQueue)
      .on('presence', { event: 'sync' }, () => {
        setOnline(new Set(Object.keys(channel.presenceState())))
      })
      .subscribe((state) => {
        if (state === 'SUBSCRIBED') {
          setConnection('connected')
          void channel.track({ at: Date.now() })
          // After a drop, anything may have changed while we were away.
          if (hasConnectedBefore) {
            refreshAll()
            void clockRef.current.sync(api.serverTime)
          }
          hasConnectedBefore = true
        } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
          setConnection('reconnecting')
        }
      })

    // Heartbeat (keeps my seat, lets others see I'm here) + a slow safety-net re-read.
    let beats = 0
    const heartbeat = window.setInterval(() => {
      api.touchMember(roomId).catch(() => {})
      beats += 1
      if (beats % 2 === 0) refreshAll()
    }, 25_000)

    const wake = () => {
      if (document.visibilityState === 'visible') {
        refreshAll()
        api.touchMember(roomId).catch(() => {})
        void clockRef.current.sync(api.serverTime, 2)
      }
    }
    const goOffline = () => setConnection('reconnecting')
    document.addEventListener('visibilitychange', wake)
    window.addEventListener('online', wake)
    window.addEventListener('offline', goOffline)

    return () => {
      window.clearInterval(heartbeat)
      document.removeEventListener('visibilitychange', wake)
      window.removeEventListener('online', wake)
      window.removeEventListener('offline', goOffline)
      void supabase.removeChannel(channel)
    }
  }, [roomId, userId, refreshAll, refreshMembers, refreshQueue])

  const applyRoom = useCallback((row: Room) => setRoom((prev) => newerRoom(prev, row)), [])
  const addMessage = useCallback(
    (m: ChatMessage) => setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m])),
    [],
  )

  return {
    status,
    error,
    room,
    members,
    messages,
    queue,
    online,
    connection,
    clock: clockRef.current,
    applyRoom,
    addMessage,
    refreshQueue,
  }
}
