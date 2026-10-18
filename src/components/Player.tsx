import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertTriangle, Crown, Loader2, Maximize, Pause, Play, SkipForward, Volume2, VolumeX } from 'lucide-react'
import { describePlayerError, loadYouTubeApi } from '../lib/youtube'
import { formatTime, planSync, type PlayerPhase, type SharedPlayback } from '../lib/sync'
import type { ServerClock } from '../lib/clock'

interface Props {
  playback: SharedPlayback
  clock: ServerClock
  isHost: boolean
  /** Title already stored for the room (null if unknown). */
  title: string | null
  /** Host pressed play / pause / seek. `position` is where the host's playhead is right now. */
  onCommand: (playing: boolean, position: number) => void
  /** The video reached its end on the host's device (duration in seconds). */
  onEnded: (duration: number) => void
  /** The player learned the title of the current video and the room doesn't have it yet. */
  onTitle: (videoId: string, title: string) => void
  /** Host only: skip the current (broken) video. Undefined when there is nothing to skip to. */
  onSkip?: () => void
  children?: ReactNode
}

const PHASES: Record<number, PlayerPhase> = {
  [-1]: 'unstarted',
  0: 'ended',
  1: 'playing',
  2: 'paused',
  3: 'buffering',
  5: 'cued',
}

/** After telling the player to load a video, give it this long before judging its state. */
const LOAD_GRACE_MS = 2500
/** Ticks (seconds) of "should be playing but isn't" before we ask the person to tap. */
const TAP_AFTER_TICKS = 3

/**
 * The shared YouTube player.
 *
 * Design: the database row is the truth. A small loop (every second, and immediately when the
 * shared state changes) compares the local player with the truth and fixes any difference.
 * Player events are only used to learn the local state - they are never sent to other people -
 * so synchronisation loops are impossible. The YouTube controls are hidden; the host uses the
 * overlay below, which is the only thing that sends commands.
 */
export function Player({ playback, clock, isHost, title, onCommand, onEnded, onTitle, onSkip, children }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YT.Player | null>(null)
  const readyRef = useRef(false)
  const loadedRef = useRef<string | null>(null)
  const phaseRef = useRef<PlayerPhase>('unstarted')
  const graceUntilRef = useRef(0)
  const stalledTicksRef = useRef(0)
  const titleSentRef = useRef<string | null>(null)
  const errorRef = useRef<string | null>(null)

  const desiredRef = useRef(playback)
  desiredRef.current = playback
  const handlers = useRef({ onEnded, onTitle, title, isHost })
  handlers.current = { onEnded, onTitle, title, isHost }

  const [apiFailed, setApiFailed] = useState(false)
  const [apiAttempt, setApiAttempt] = useState(0)
  const [phase, setPhase] = useState<PlayerPhase>('unstarted')
  const [error, setError] = useState<string | null>(null)
  const [needsTap, setNeedsTap] = useState(false)
  const [time, setTime] = useState({ current: 0, duration: 0 })
  const [scrub, setScrub] = useState<number | null>(null)
  const scrubRef = useRef<number | null>(null)
  const [muted, setMuted] = useState(false)
  const [loadingVideo, setLoadingVideo] = useState(false)

  const setErr = (message: string | null) => {
    errorRef.current = message
    setError(message)
  }

  // ---- reconcile: make the local player match the shared state -------------------------------
  const reconcile = useCallback(() => {
    const player = playerRef.current
    const desired = desiredRef.current
    if (!player || !readyRef.current || !desired.videoId) return
    if (Date.now() < graceUntilRef.current) return
    if (errorRef.current && loadedRef.current === desired.videoId) return

    const snapshot = {
      loadedVideoId: loadedRef.current,
      phase: phaseRef.current,
      currentTime: safeNumber(() => player.getCurrentTime()),
      duration: safeNumber(() => player.getDuration()),
    }
    const actions = planSync(desired, snapshot, clock.now())

    for (const a of actions) {
      try {
        switch (a.type) {
          case 'load':
            loadedRef.current = a.videoId
            titleSentRef.current = null
            graceUntilRef.current = Date.now() + LOAD_GRACE_MS
            stalledTicksRef.current = 0
            setErr(null)
            setNeedsTap(false)
            setLoadingVideo(true)
            if (a.autoplay) player.loadVideoById({ videoId: a.videoId, startSeconds: a.start })
            else player.cueVideoById({ videoId: a.videoId, startSeconds: a.start })
            break
          case 'play':
            player.playVideo()
            break
          case 'pause':
            player.pauseVideo()
            break
          case 'seek':
            player.seekTo(a.to, true)
            break
        }
      } catch {
        /* the player may be mid-teardown; the next tick will retry */
      }
    }

    // Autoplay can be blocked until the person touches the page (phones are strict about it).
    const shouldBePlaying = desired.playing && loadedRef.current === desired.videoId
    const isMoving = phaseRef.current === 'playing' || phaseRef.current === 'buffering'
    if (shouldBePlaying && !isMoving && phaseRef.current !== 'ended') {
      stalledTicksRef.current += 1
      if (stalledTicksRef.current >= TAP_AFTER_TICKS) setNeedsTap(true)
    } else {
      stalledTicksRef.current = 0
      if (isMoving) setNeedsTap(false)
    }
  }, [clock])

  // React immediately to a new shared state (host pressed something, video changed...).
  useEffect(() => {
    reconcile()
  }, [playback.seq, playback.videoId, playback.playing, playback.position, reconcile])

  // ---- create the YouTube player the first time a video exists ------------------------------------
  const hasVideo = playback.videoId !== null
  useEffect(() => {
    if (!hasVideo || playerRef.current || !mountRef.current) return
    let cancelled = false
    setApiFailed(false)

    loadYouTubeApi()
      .then(() => {
        if (cancelled || !mountRef.current) return
        // The API replaces the element it is given, so hand it a fresh child.
        const target = document.createElement('div')
        mountRef.current.appendChild(target)

        const events: Record<string, unknown> = {
          onReady: () => {
            readyRef.current = true
            reconcile()
          },
          onStateChange: (e: YT.OnStateChangeEvent) => {
            const next = PHASES[e.data] ?? 'unstarted'
            phaseRef.current = next
            setPhase(next)
            if (next === 'playing' || next === 'paused' || next === 'cued') setLoadingVideo(false)
            if (next === 'playing') {
              setNeedsTap(false)
              setErr(null)
            }
            if (next === 'ended' && handlers.current.isHost) {
              handlers.current.onEnded(safeNumber(() => playerRef.current?.getDuration() ?? 0))
            }
          },
          onError: (e: YT.OnErrorEvent) => {
            setLoadingVideo(false)
            setErr(describePlayerError(e.data))
          },
          // Newer API event: fired when the browser refuses to autoplay.
          onAutoplayBlocked: () => setNeedsTap(true),
        }

        playerRef.current = new YT.Player(target, {
          host: 'https://www.youtube-nocookie.com',
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            fs: 0,
            rel: 0,
            modestbranding: 1,
            iv_load_policy: 3,
            playsinline: 1,
            origin: window.location.origin,
          },
          events: events as YT.Events,
        } as YT.PlayerOptions)
      })
      .catch(() => {
        if (!cancelled) setApiFailed(true)
      })

    return () => {
      cancelled = true
    }
  }, [hasVideo, apiAttempt, reconcile])

  // Tear the player down when leaving the room.
  useEffect(() => {
    return () => {
      readyRef.current = false
      try {
        playerRef.current?.destroy()
      } catch {
        /* ignore */
      }
      playerRef.current = null
    }
  }, [])

  // ---- 1 Hz heartbeat: reconcile, refresh the clock display, report the title -----------------------
  useEffect(() => {
    const tick = window.setInterval(() => {
      const player = playerRef.current
      if (!player || !readyRef.current) return
      reconcile()
      if (scrubRef.current === null) {
        setTime({
          current: safeNumber(() => player.getCurrentTime()),
          duration: safeNumber(() => player.getDuration()),
        })
      }
      const id = loadedRef.current
      if (id && titleSentRef.current !== id && !handlers.current.title) {
        const data = safeValue(() => (player as unknown as VideoDataSource).getVideoData())
        if (data && data.video_id === id && data.title) {
          titleSentRef.current = id
          handlers.current.onTitle(id, data.title)
        }
      }
    }, 1000)
    const wake = () => {
      if (document.visibilityState === 'visible') reconcile()
    }
    document.addEventListener('visibilitychange', wake)
    return () => {
      window.clearInterval(tick)
      document.removeEventListener('visibilitychange', wake)
    }
  }, [reconcile])

  // Forget the local error as soon as the room moves on to another video.
  useEffect(() => {
    if (error && loadedRef.current !== playback.videoId) setErr(null)
  }, [playback.videoId, error])

  // ---- host controls ---------------------------------------------------------------------------------
  const hostPlayPause = () => {
    const player = playerRef.current
    if (!isHost || !player || !readyRef.current) return
    const nowPlaying = desiredRef.current.playing
    const position = safeNumber(() => player.getCurrentTime())
    // Starting playback: by the time the command reaches the server a little time has passed.
    onCommand(!nowPlaying, nowPlaying ? position : position + clock.oneWaySeconds)
  }

  const commitScrub = () => {
    const value = scrubRef.current
    scrubRef.current = null
    setScrub(null)
    if (value === null || !isHost) return
    const playing = desiredRef.current.playing
    onCommand(playing, playing ? value + clock.oneWaySeconds : value)
  }

  const onScrubChange = (value: number) => {
    scrubRef.current = value
    setScrub(value)
  }

  const tapToPlay = () => {
    const player = playerRef.current
    if (!player) return
    try {
      player.unMute()
      setMuted(false)
      player.playVideo()
    } catch {
      /* ignore */
    }
    setNeedsTap(false)
  }

  const toggleMute = () => {
    const player = playerRef.current
    if (!player) return
    try {
      if (player.isMuted()) {
        player.unMute()
        setMuted(false)
      } else {
        player.mute()
        setMuted(true)
      }
    } catch {
      /* ignore */
    }
  }

  const goFullscreen = () => {
    const el = frameRef.current
    if (!el) return
    if (document.fullscreenElement) void document.exitFullscreen()
    else void el.requestFullscreen?.().catch(() => {})
  }

  const showSpinner = hasVideo && !error && !apiFailed && (loadingVideo || phase === 'buffering')
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true
  const duration = time.duration
  const sliderValue = scrub ?? Math.min(time.current, duration || 0)
  const playing = playback.playing

  return (
    <div className="w-full">
      <div
        ref={frameRef}
        className="relative aspect-video w-full overflow-hidden rounded-3xl bg-black shadow-2xl ring-1 ring-white/10 max-lg:rounded-none max-lg:ring-0"
      >
        {/* YouTube's iframe lives here */}
        <div ref={mountRef} className="yt-host absolute inset-0" />

        {/* Empty state */}
        {!hasVideo && (
          <div className="absolute inset-0 grid place-items-center bg-gradient-to-br from-[#1a1340] via-[#14102e] to-[#0d1a3a] p-6 text-center">
            <div className="animate-fade-up">
              <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-full bg-white/10 text-3xl">🍿</div>
              <p className="text-lg font-semibold text-white">Nothing playing yet</p>
              <p className="mt-1 max-w-xs text-sm text-white/60">
                {isHost
                  ? 'Paste a YouTube link below to start the show.'
                  : 'The host will pick something soon. You can add videos to the queue meanwhile.'}
              </p>
            </div>
          </div>
        )}

        {/* Shield: stops accidental taps on YouTube's own UI (links, ads' buttons, hidden controls). */}
        {hasVideo && !error && !apiFailed && <div className="absolute inset-0" onClick={isHost ? hostPlayPause : undefined} />}

        {showSpinner && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-black/50 backdrop-blur">
              <Loader2 className="h-7 w-7 animate-spin text-white" aria-label="Buffering" />
            </div>
          </div>
        )}

        {needsTap && !error && (
          <button
            onClick={tapToPlay}
            className="absolute inset-0 z-10 grid place-items-center bg-black/60 backdrop-blur-sm"
          >
            <span className="animate-pop flex items-center gap-2 rounded-full bg-brand px-6 py-3 text-base font-semibold text-white shadow-xl">
              <Play className="h-5 w-5 fill-white" /> Tap to join the show
            </span>
          </button>
        )}

        {apiFailed && (
          <Overlay icon={<AlertTriangle className="h-8 w-8 text-amber-300" />} text={describePlayerError(-1)}>
            <button
              onClick={() => setApiAttempt((n) => n + 1)}
              className="rounded-full bg-white/15 px-5 py-2 text-sm font-semibold text-white hover:bg-white/25"
            >
              Try again
            </button>
          </Overlay>
        )}

        {error && (
          <Overlay icon={<AlertTriangle className="h-8 w-8 text-amber-300" />} text={error}>
            {isHost && onSkip ? (
              <button
                onClick={onSkip}
                className="flex items-center gap-2 rounded-full bg-brand px-5 py-2 text-sm font-semibold text-white"
              >
                <SkipForward className="h-4 w-4" /> Play next in queue
              </button>
            ) : (
              <p className="text-xs text-white/60">
                {isHost ? 'Paste a different link below.' : 'Waiting for the host to pick another video.'}
              </p>
            )}
          </Overlay>
        )}

        {/* Control bar */}
        {hasVideo && (
          <div className="absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/85 via-black/40 to-transparent px-3 pb-2 pt-8">
            <input
              type="range"
              className="vybe-range w-full"
              min={0}
              max={Math.max(duration, 1)}
              step={0.5}
              value={sliderValue}
              disabled={!isHost || duration <= 0}
              aria-label="Seek"
              onChange={(e) => onScrubChange(Number(e.target.value))}
              onPointerUp={commitScrub}
              onTouchEnd={commitScrub}
              onKeyUp={commitScrub}
              onBlur={() => scrubRef.current !== null && commitScrub()}
              style={{
                background: `linear-gradient(90deg, var(--brand-a) ${(duration ? (sliderValue / duration) * 100 : 0).toFixed(1)}%, rgb(255 255 255 / 0.25) 0)`,
              }}
            />
            <div className="mt-1 flex items-center gap-2 text-white">
              <button
                onClick={hostPlayPause}
                disabled={!isHost}
                aria-label={playing ? 'Pause for everyone' : 'Play for everyone'}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/15 transition enabled:hover:bg-white/25 disabled:opacity-60"
              >
                {playing ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white" />}
              </button>
              <span className="min-w-0 text-xs tabular-nums text-white/80">
                {formatTime(sliderValue)} / {formatTime(duration)}
              </span>
              <span className="ml-auto flex items-center gap-1 text-[11px] text-white/60">
                {isHost ? (
                  <>
                    <Crown className="h-3.5 w-3.5 text-amber-300" /> You control playback
                  </>
                ) : (
                  <>Host controls playback</>
                )}
              </span>
              <button
                onClick={toggleMute}
                aria-label={muted ? 'Unmute' : 'Mute'}
                className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15"
              >
                {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
              </button>
              {canFullscreen && (
                <button
                  onClick={goFullscreen}
                  aria-label="Fullscreen"
                  className="grid h-10 w-10 place-items-center rounded-full hover:bg-white/15"
                >
                  <Maximize className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

function Overlay({ icon, text, children }: { icon: ReactNode; text: string; children?: ReactNode }) {
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/80 p-6 text-center backdrop-blur-sm">
      <div className="animate-pop flex max-w-sm flex-col items-center gap-3">
        {icon}
        <p className="text-sm text-white/90">{text}</p>
        {children}
      </div>
    </div>
  )
}

/** getVideoData() exists on the player but is missing from some versions of the type definitions. */
interface VideoDataSource {
  getVideoData(): { video_id?: string; title?: string }
}

function safeNumber(read: () => number): number {
  try {
    const n = read()
    return Number.isFinite(n) ? n : 0
  } catch {
    return 0
  }
}

function safeValue<T>(read: () => T): T | null {
  try {
    return read()
  } catch {
    return null
  }
}
