import { useCallback, useEffect, useRef, useState } from 'react'
import type { Room as LiveKitRoom } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { LIVEKIT_URL, voiceEnabled } from '../lib/config'
import { friendlyError } from '../lib/errors'

export type VoiceState = 'off' | 'connecting' | 'on'

export interface Voice {
  /** False when no LiveKit URL is configured - hide the button entirely. */
  available: boolean
  state: VoiceState
  muted: boolean
  /** Joined, but the browser didn't give us a microphone: listen-only. */
  micBlocked: boolean
  /** user ids of people talking right now */
  speaking: Set<string>
  /** user ids of people connected to voice */
  inVoice: Set<string>
  error: string | null
  join: () => Promise<void>
  leave: () => void
  toggleMute: () => Promise<void>
}

/**
 * Optional voice chat through LiveKit (WebRTC). The browser asks the `livekit-token` Supabase
 * Edge Function for a short-lived token - it only hands one to room members - and the LiveKit
 * secret never leaves the server. The LiveKit library is loaded on demand, so people who never
 * tap the microphone don't download it.
 */
export function useVoice(roomId: string | undefined): Voice {
  const [state, setState] = useState<VoiceState>('off')
  const [muted, setMuted] = useState(true)
  const [micBlocked, setMicBlocked] = useState(false)
  const [speaking, setSpeaking] = useState<Set<string>>(new Set())
  const [inVoice, setInVoice] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const roomRef = useRef<LiveKitRoom | null>(null)
  const attemptRef = useRef(0)

  const cleanup = useCallback(() => {
    attemptRef.current += 1
    const room = roomRef.current
    roomRef.current = null
    if (room) {
      room.removeAllListeners()
      void room.disconnect()
    }
    document.querySelectorAll('audio[data-vybe-voice]').forEach((el) => el.remove())
    setState('off')
    setMuted(true)
    setMicBlocked(false)
    setSpeaking(new Set())
    setInVoice(new Set())
  }, [])

  // Hang up when leaving the room screen.
  useEffect(() => cleanup, [cleanup, roomId])

  const join = useCallback(async () => {
    if (!voiceEnabled || !roomId || roomRef.current) return
    const attempt = ++attemptRef.current
    setError(null)
    setState('connecting')

    try {
      const { data, error: fnError } = await supabase.functions.invoke<{ token?: string }>('livekit-token', {
        body: { room_id: roomId },
      })
      if (fnError || !data?.token) throw fnError ?? new Error('non-2xx')
      if (attempt !== attemptRef.current) return

      const lk = await import('livekit-client')
      if (attempt !== attemptRef.current) return

      const room = new lk.Room({
        audioCaptureDefaults: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      roomRef.current = room

      const syncParticipants = () => {
        const ids = new Set<string>([room.localParticipant.identity])
        room.remoteParticipants.forEach((p) => ids.add(p.identity))
        setInVoice(ids)
      }

      room
        .on(lk.RoomEvent.TrackSubscribed, (track) => {
          if (track.kind === lk.Track.Kind.Audio) {
            const el = track.attach()
            el.setAttribute('data-vybe-voice', '1')
            el.style.display = 'none'
            document.body.appendChild(el)
          }
        })
        .on(lk.RoomEvent.TrackUnsubscribed, (track) => {
          track.detach().forEach((el) => el.remove())
        })
        .on(lk.RoomEvent.ActiveSpeakersChanged, (list) => setSpeaking(new Set(list.map((p) => p.identity))))
        .on(lk.RoomEvent.ParticipantConnected, syncParticipants)
        .on(lk.RoomEvent.ParticipantDisconnected, syncParticipants)
        .on(lk.RoomEvent.Disconnected, () => {
          if (roomRef.current === room) cleanup()
        })

      await room.connect(LIVEKIT_URL, data.token)
      if (attempt !== attemptRef.current) {
        void room.disconnect()
        return
      }
      // iOS Safari only plays remote audio after a user gesture; this call came from a tap.
      await room.startAudio().catch(() => {})
      syncParticipants()
      setState('on')

      try {
        await room.localParticipant.setMicrophoneEnabled(true)
        setMuted(false)
      } catch {
        // Permission denied or no microphone: stay in the call as a listener.
        setMuted(true)
        setMicBlocked(true)
        setError('Microphone blocked. You can hear everyone — allow the microphone in your browser settings to talk.')
      }
    } catch (e) {
      if (attempt !== attemptRef.current) return
      cleanup()
      setError(friendlyError(e))
    }
  }, [roomId, cleanup])

  const toggleMute = useCallback(async () => {
    const room = roomRef.current
    if (!room) return
    const wantMic = muted // currently muted -> turn the mic on
    try {
      await room.localParticipant.setMicrophoneEnabled(wantMic)
      setMuted(!wantMic)
      if (wantMic) {
        setMicBlocked(false)
        setError(null)
      }
    } catch {
      setMicBlocked(true)
      setError('Microphone blocked. Allow the microphone in your browser settings, then try again.')
    }
  }, [muted])

  return {
    available: voiceEnabled,
    state,
    muted,
    micBlocked,
    speaking,
    inVoice,
    error,
    join,
    leave: cleanup,
    toggleMute,
  }
}
