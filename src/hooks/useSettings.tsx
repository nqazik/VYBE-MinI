import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AVATARS } from '../lib/avatars'
import { readStorage, writeStorage } from '../lib/storage'

export type ThemeId = 'midnight' | 'twilight' | 'daylight'

export const THEMES: { id: ThemeId; label: string; blurb: string; swatch: [string, string]; themeColor: string }[] = [
  { id: 'midnight', label: 'Midnight', blurb: 'Deep indigo, violet & blue', swatch: ['#8b5cf6', '#3b82f6'], themeColor: '#0a0914' },
  { id: 'twilight', label: 'Twilight', blurb: 'Warm dusk, magenta & indigo', swatch: ['#d946ef', '#6366f1'], themeColor: '#130a18' },
  { id: 'daylight', label: 'Daylight', blurb: 'Soft light mode', swatch: ['#7c3aed', '#2563eb'], themeColor: '#f4f1ff' },
]

export interface Settings {
  name: string
  avatar: string
  theme: ThemeId
}

const STORAGE_KEY = 'vybe.settings'
const DEFAULTS: Settings = { name: '', avatar: AVATARS[0], theme: 'midnight' }

function load(): Settings {
  const raw = readStorage(STORAGE_KEY)
  if (!raw) return DEFAULTS
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>
    return {
      name: typeof parsed.name === 'string' ? parsed.name.slice(0, 24) : DEFAULTS.name,
      avatar: typeof parsed.avatar === 'string' && parsed.avatar ? parsed.avatar : DEFAULTS.avatar,
      theme: THEMES.some((t) => t.id === parsed.theme) ? (parsed.theme as ThemeId) : DEFAULTS.theme,
    }
  } catch {
    return DEFAULTS
  }
}

interface SettingsContextValue {
  settings: Settings
  /** True once the person has picked a display name. */
  hasProfile: boolean
  update: (patch: Partial<Settings>) => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', settings.theme)
    const color = THEMES.find((t) => t.id === settings.theme)?.themeColor ?? '#0a0914'
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
    writeStorage(STORAGE_KEY, JSON.stringify(settings))
  }, [settings])

  const update = useCallback((patch: Partial<Settings>) => setSettings((s) => ({ ...s, ...patch })), [])

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, hasProfile: settings.name.trim().length > 0, update }),
    [settings, update],
  )
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext)
  if (!ctx) throw new Error('useSettings must be used inside <SettingsProvider>')
  return ctx
}
