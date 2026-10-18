import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVideoId, describePlayerError } from './youtube.ts'
import { extractCode, formatCode, inviteLink, isValidCode, normalizeCode } from './code.ts'

const ID = 'dQw4w9WgXcQ'

test('parseVideoId understands the common YouTube URL shapes', () => {
  const urls = [
    `https://www.youtube.com/watch?v=${ID}`,
    `https://youtube.com/watch?v=${ID}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${ID}`,
    `https://music.youtube.com/watch?v=${ID}`,
    `https://youtu.be/${ID}`,
    `https://youtu.be/${ID}?si=abc123`,
    `https://www.youtube.com/shorts/${ID}`,
    `https://www.youtube.com/embed/${ID}`,
    `https://www.youtube.com/live/${ID}?feature=share`,
    `www.youtube.com/watch?v=${ID}`,
    `youtube.com/watch?v=${ID}`,
    `  ${ID}  `,
  ]
  for (const u of urls) assert.equal(parseVideoId(u), ID, u)
})

test('parseVideoId rejects things that are not a single video', () => {
  const bad = [
    '',
    '   ',
    'hello',
    'https://example.com/watch?v=dQw4w9WgXcQ',
    'https://www.youtube.com/playlist?list=PL123',
    'https://www.youtube.com/@somechannel',
    'https://www.youtube.com/watch?v=short',
    'not a url at all !!',
  ]
  for (const u of bad) assert.equal(parseVideoId(u), null, u)
})

test('describePlayerError covers the documented codes', () => {
  for (const code of [2, 5, 100, 101, 150, -1, 999]) {
    assert.ok(describePlayerError(code).length > 10)
  }
  assert.equal(describePlayerError(101), describePlayerError(150))
})

test('room codes: normalise, validate and format', () => {
  assert.equal(normalizeCode('abcde-fghjk'), 'ABCDEFGHJK')
  assert.equal(normalizeCode(' ab cd e-f g h j k extra'), 'ABCDEFGHJK')
  // look-alike characters are not part of the alphabet
  assert.equal(normalizeCode('I0O1ABC'), 'ABC')
  assert.equal(isValidCode('ABCDEFGHJK'), true)
  assert.equal(isValidCode('ABCDEFGHJ'), false)
  assert.equal(isValidCode('ABCDEFGHJ0'), false)
  assert.equal(formatCode('abcdefghjk'), 'ABCDE-FGHJK')
  assert.equal(formatCode('abc'), 'ABC')
})

test('extractCode accepts bare codes and full invitation links', () => {
  assert.equal(extractCode('ABCDE-FGHJK'), 'ABCDEFGHJK')
  assert.equal(extractCode('https://vybe.example.com/join/ABCDE-FGHJK'), 'ABCDEFGHJK')
  assert.equal(extractCode('Join me: https://vybe.example.com/join/abcde-fghjk?x=1'), 'ABCDEFGHJK')
  assert.equal(extractCode('https://vybe.example.com/room/ABCDEFGHJK'), 'ABCDEFGHJK')
  assert.equal(inviteLink('ABCDEFGHJK', 'https://vybe.example.com'), 'https://vybe.example.com/join/ABCDE-FGHJK')
})
