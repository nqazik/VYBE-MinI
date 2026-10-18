/**
 * Pure synchronisation logic. No DOM, no network - everything here is unit-tested.
 *
 * The room row in the database is the single source of truth ("shared playback").
 * Every client (host included) runs a small reconcile loop that compares its own
 * YouTube player with the shared state and decides what to do. Because the loop is
 * declarative ("make my player match the state"), nothing is ever echoed back to the
 * server by player events, so synchronisation loops cannot happen.
 */

export interface SharedPlayback {
  videoId: string | null
  playing: boolean
  /** Position (seconds) at `updatedAtMs`. */
  position: number
  /** Server timestamp (ms since epoch) at which `position` was valid. */
  updatedAtMs: number
  /** Monotonic counter bumped by the server on every playback command. */
  seq: number
}

export type PlayerPhase = 'unstarted' | 'ended' | 'playing' | 'paused' | 'buffering' | 'cued'

export interface PlayerSnapshot {
  /** The video id we last asked the player to load (not what YouTube reports - ads can change that). */
  loadedVideoId: string | null
  phase: PlayerPhase
  currentTime: number
  duration: number
}

export type SyncAction =
  | { type: 'load'; videoId: string; start: number; autoplay: boolean }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seek'; to: number }

/** Re-seek a playing player only when it has drifted further than this (seconds). */
export const DRIFT_PLAYING = 1.2
/** Re-seek a paused player when it is further than this from the shared position (seconds). */
export const DRIFT_PAUSED = 0.6

/** Where the shared playhead should be right now, given the server clock. */
export function expectedPosition(state: SharedPlayback, serverNowMs: number): number {
  if (!state.playing) return Math.max(0, state.position)
  const elapsed = Math.max(0, (serverNowMs - state.updatedAtMs) / 1000)
  return Math.max(0, state.position + elapsed)
}

/** Decide what (if anything) must be done to make the local player match the shared state. */
export function planSync(
  desired: SharedPlayback,
  snap: PlayerSnapshot,
  serverNowMs: number,
): SyncAction[] {
  if (!desired.videoId) return []

  let target = expectedPosition(desired, serverNowMs)
  if (snap.duration > 0) target = Math.min(target, snap.duration)

  if (snap.loadedVideoId !== desired.videoId) {
    return [{ type: 'load', videoId: desired.videoId, start: target, autoplay: desired.playing }]
  }

  const drift = snap.currentTime - target
  const actions: SyncAction[] = []

  if (snap.phase === 'ended') {
    // Only restart an ended video if the room is genuinely still in the middle of it
    // (e.g. a late reconnect). Otherwise leave it at the end - the host decides what's next.
    if (desired.playing && snap.duration > 0 && target < snap.duration - 2) {
      actions.push({ type: 'seek', to: target }, { type: 'play' })
    }
    return actions
  }

  if (desired.playing) {
    // While buffering the playhead is not moving, so measuring drift would cause seek storms.
    if (snap.phase !== 'buffering' && Math.abs(drift) > DRIFT_PLAYING) {
      actions.push({ type: 'seek', to: target })
    }
    if (snap.phase === 'paused' || snap.phase === 'cued' || snap.phase === 'unstarted') {
      actions.push({ type: 'play' })
    }
  } else {
    if (snap.phase === 'playing' || snap.phase === 'buffering') {
      actions.push({ type: 'pause' })
    }
    if (Math.abs(drift) > DRIFT_PAUSED) {
      actions.push({ type: 'seek', to: target })
    }
  }
  return actions
}

/** Parse a Postgres timestamptz string (any fractional precision) into epoch milliseconds. */
export function parseTimestamp(value: string): number {
  const normalised = value
    .replace(' ', 'T')
    // JS only guarantees millisecond precision; Postgres sends microseconds.
    .replace(/(\.\d{3})\d+/, '$1')
    // "+00" -> "+00:00" so every engine accepts it
    .replace(/([+-]\d{2})$/, '$1:00')
  const ms = Date.parse(normalised)
  return Number.isFinite(ms) ? ms : Date.now()
}

/** Build a SharedPlayback from a rooms table row. */
export function playbackFromRow(row: {
  video_id: string | null
  is_playing: boolean
  position_sec: number
  state_updated_at: string
  state_seq: number | string
}): SharedPlayback {
  return {
    videoId: row.video_id,
    playing: row.is_playing,
    position: Number(row.position_sec) || 0,
    updatedAtMs: parseTimestamp(row.state_updated_at),
    seq: Number(row.state_seq) || 0,
  }
}

export function formatTime(totalSeconds: number): string {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return '0:00'
  const s = Math.floor(totalSeconds)
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m)
  return `${h > 0 ? h + ':' : ''}${mm}:${String(sec).padStart(2, '0')}`
}
