import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  DRIFT_PLAYING,
  expectedPosition,
  formatTime,
  parseTimestamp,
  planSync,
  playbackFromRow,
  type PlayerSnapshot,
  type SharedPlayback,
} from './sync.ts'

const NOW = 1_800_000_000_000

const state = (over: Partial<SharedPlayback> = {}): SharedPlayback => ({
  videoId: 'dQw4w9WgXcQ',
  playing: true,
  position: 10,
  updatedAtMs: NOW,
  seq: 1,
  ...over,
})

const snap = (over: Partial<PlayerSnapshot> = {}): PlayerSnapshot => ({
  loadedVideoId: 'dQw4w9WgXcQ',
  phase: 'playing',
  currentTime: 10,
  duration: 200,
  ...over,
})

test('expectedPosition advances while playing and holds while paused', () => {
  assert.equal(expectedPosition(state(), NOW + 5000), 15)
  assert.equal(expectedPosition(state({ playing: false }), NOW + 5000), 10)
})

test('expectedPosition never goes negative or backwards (clock skew)', () => {
  assert.equal(expectedPosition(state(), NOW - 3000), 10)
  assert.equal(expectedPosition(state({ position: -4, playing: false }), NOW), 0)
})

test('nothing to do without a video', () => {
  assert.deepEqual(planSync(state({ videoId: null }), snap(), NOW), [])
})

test('loads the shared video when the player has a different one, starting at the live position', () => {
  const actions = planSync(state(), snap({ loadedVideoId: null }), NOW + 30_000)
  assert.deepEqual(actions, [{ type: 'load', videoId: 'dQw4w9WgXcQ', start: 40, autoplay: true }])
})

test('a late joiner to a paused room cues instead of autoplaying', () => {
  const actions = planSync(state({ playing: false, position: 75 }), snap({ loadedVideoId: null }), NOW)
  assert.deepEqual(actions, [{ type: 'load', videoId: 'dQw4w9WgXcQ', start: 75, autoplay: false }])
})

test('in-sync playing player needs no action (small drift is tolerated)', () => {
  assert.deepEqual(planSync(state(), snap({ currentTime: 10 + DRIFT_PLAYING - 0.1 }), NOW), [])
  assert.deepEqual(planSync(state(), snap({ currentTime: 10 - DRIFT_PLAYING + 0.1 }), NOW), [])
})

test('seeks when a playing player drifts too far, in either direction', () => {
  assert.deepEqual(planSync(state(), snap({ currentTime: 14 }), NOW), [{ type: 'seek', to: 10 }])
  assert.deepEqual(planSync(state(), snap({ currentTime: 3 }), NOW), [{ type: 'seek', to: 10 }])
})

test('never seeks while buffering (playhead is frozen, would cause seek storms)', () => {
  assert.deepEqual(planSync(state(), snap({ phase: 'buffering', currentTime: 0 }), NOW), [])
})

test('starts a paused local player when the room is playing', () => {
  assert.deepEqual(planSync(state(), snap({ phase: 'paused' }), NOW), [{ type: 'play' }])
  assert.deepEqual(planSync(state(), snap({ phase: 'cued', currentTime: 0 }), NOW), [
    { type: 'seek', to: 10 },
    { type: 'play' },
  ])
})

test('pauses a playing local player when the room is paused', () => {
  const actions = planSync(state({ playing: false }), snap({ phase: 'playing' }), NOW)
  assert.deepEqual(actions, [{ type: 'pause' }])
})

test('paused room: aligns the frame with the shared position', () => {
  const actions = planSync(state({ playing: false, position: 50 }), snap({ phase: 'paused', currentTime: 10 }), NOW)
  assert.deepEqual(actions, [{ type: 'seek', to: 50 }])
})

test('target is clamped to the video duration', () => {
  const actions = planSync(state({ position: 190 }), snap({ currentTime: 150, duration: 200 }), NOW + 60_000)
  assert.deepEqual(actions, [{ type: 'seek', to: 200 }])
})

test('an ended video is not restarted when the room is at the end', () => {
  assert.deepEqual(planSync(state({ position: 199 }), snap({ phase: 'ended', currentTime: 200 }), NOW), [])
})

test('an ended video IS rejoined when the room is still mid-video', () => {
  const actions = planSync(state({ position: 60 }), snap({ phase: 'ended', currentTime: 200 }), NOW)
  assert.deepEqual(actions, [{ type: 'seek', to: 60 }, { type: 'play' }])
})

test('two clients applying the same state converge on the same target', () => {
  const s = state({ position: 33 })
  const a = planSync(s, snap({ loadedVideoId: null }), NOW + 12_345)
  const b = planSync(s, snap({ loadedVideoId: null }), NOW + 12_345)
  assert.deepEqual(a, b)
})

test('parseTimestamp handles Postgres microseconds, short offsets and spaces', () => {
  const iso = '2026-10-17T18:11:00.123Z'
  const expected = Date.parse(iso)
  assert.equal(parseTimestamp('2026-10-17T18:11:00.123456+00:00'), expected)
  assert.equal(parseTimestamp('2026-10-17 18:11:00.123456+00'), expected)
  assert.equal(parseTimestamp('2026-10-17T18:11:00.123+00:00'), expected)
})

test('playbackFromRow maps database columns', () => {
  const p = playbackFromRow({
    video_id: 'dQw4w9WgXcQ',
    is_playing: true,
    position_sec: 12.5,
    state_updated_at: '2026-10-17T18:11:00.000000+00:00',
    state_seq: '7',
  })
  assert.equal(p.videoId, 'dQw4w9WgXcQ')
  assert.equal(p.position, 12.5)
  assert.equal(p.seq, 7)
  assert.equal(p.updatedAtMs, Date.parse('2026-10-17T18:11:00.000Z'))
})

test('formatTime', () => {
  assert.equal(formatTime(0), '0:00')
  assert.equal(formatTime(65), '1:05')
  assert.equal(formatTime(3725), '1:02:05')
  assert.equal(formatTime(NaN), '0:00')
})
