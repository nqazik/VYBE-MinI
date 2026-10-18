export const AVATARS = [
  '🦊', '🐼', '🐸', '🦄', '🐙', '🐧', '🦉', '🐯',
  '🐻', '🐨', '🦖', '🐳', '🦋', '🐝', '🌵', '🍄',
] as const

const GRADIENTS: [string, string][] = [
  ['#8b5cf6', '#3b82f6'],
  ['#ec4899', '#8b5cf6'],
  ['#06b6d4', '#3b82f6'],
  ['#f59e0b', '#ec4899'],
  ['#10b981', '#06b6d4'],
  ['#f43f5e', '#f59e0b'],
]

function hash(text: string): number {
  let h = 0
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0
  return h
}

/** A stable background gradient for a person, derived from their name + avatar. */
export function avatarGradient(seed: string): string {
  const [a, b] = GRADIENTS[hash(seed) % GRADIENTS.length]
  return `linear-gradient(135deg, ${a}, ${b})`
}
