import { Headphones, Loader2, Mic, MicOff, PhoneOff } from 'lucide-react'
import type { Voice } from '../hooks/useVoice'

/** Compact voice-chat controls for the room header. Renders nothing when voice isn't configured. */
export function VoiceBar({ voice }: { voice: Voice }) {
  if (!voice.available) return null

  if (voice.state === 'off') {
    return (
      <button
        onClick={() => void voice.join()}
        aria-label="Join voice chat"
        title="Join voice chat (headphones recommended)"
        className="glass flex h-10 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition active:scale-95"
      >
        <Headphones className="h-4 w-4" />
        <span className="max-sm:hidden">Voice</span>
      </button>
    )
  }

  if (voice.state === 'connecting') {
    return (
      <div className="glass flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> <span className="max-sm:hidden">Connecting…</span>
      </div>
    )
  }

  return (
    <div className="glass flex h-10 items-center gap-1 rounded-full p-1">
      <button
        onClick={() => void voice.toggleMute()}
        aria-label={voice.muted ? 'Unmute microphone' : 'Mute microphone'}
        title={voice.muted ? 'Unmute' : 'Mute'}
        className={`grid h-8 w-8 place-items-center rounded-full transition active:scale-90 ${
          voice.muted ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
        }`}
      >
        {voice.muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
      </button>
      <button
        onClick={voice.leave}
        aria-label="Leave voice chat"
        title="Leave voice chat"
        className="grid h-8 w-8 place-items-center rounded-full text-muted transition hover:text-ink active:scale-90"
      >
        <PhoneOff className="h-4 w-4" />
      </button>
    </div>
  )
}
