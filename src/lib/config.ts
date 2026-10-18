const url = (import.meta.env.VITE_SUPABASE_URL ?? '').trim()
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY ?? '').trim()

export const SUPABASE_URL = url
export const SUPABASE_ANON_KEY = key

/** False until .env.local has real (non-placeholder) Supabase values. The app shows a setup screen instead of crashing. */
export const isConfigured = Boolean(
  url && key && /^https?:\/\//.test(url) && !url.includes('YOUR-') && !key.includes('YOUR-'),
)

/** Voice chat is optional: it only appears when a LiveKit URL is configured. */
export const LIVEKIT_URL = (import.meta.env.VITE_LIVEKIT_URL ?? '').trim()
export const voiceEnabled = LIVEKIT_URL.startsWith('wss://') || LIVEKIT_URL.startsWith('ws://')
