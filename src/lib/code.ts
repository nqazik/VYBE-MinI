/** Room codes: 10 characters from a 32-symbol alphabet without look-alikes (no I, O, 0, 1). ~50 bits of entropy. */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CODE_LENGTH = 10

const ALLOWED = new Set(CODE_ALPHABET.split(''))

/** "abcde-fghjk" -> "ABCDEFGHJK". Drops any character that cannot appear in a code. */
export function normalizeCode(input: string): string {
  return input
    .toUpperCase()
    .split('')
    .filter((c) => ALLOWED.has(c))
    .join('')
    .slice(0, CODE_LENGTH)
}

export function isValidCode(code: string): boolean {
  return code.length === CODE_LENGTH && code.split('').every((c) => ALLOWED.has(c))
}

/** "ABCDEFGHJK" -> "ABCDE-FGHJK" */
export function formatCode(code: string): string {
  const c = normalizeCode(code)
  return c.length > 5 ? `${c.slice(0, 5)}-${c.slice(5)}` : c
}

/**
 * Pull a room code out of whatever the person pasted: a bare code, a code with a dash,
 * or a full invitation link such as https://example.com/join/ABCDE-FGHJK
 */
export function extractCode(input: string): string {
  const text = input.trim()
  const fromLink = text.match(/\/(?:join|room)\/([A-Za-z0-9-]+)/i)
  return normalizeCode(fromLink ? fromLink[1] : text)
}

export function inviteLink(code: string, origin: string): string {
  return `${origin}/join/${formatCode(code)}`
}
