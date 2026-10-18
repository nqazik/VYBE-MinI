const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/

/** Extract an 11-character YouTube video id from a URL (watch, youtu.be, shorts, embed, live) or a bare id. */
export function parseVideoId(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  if (VIDEO_ID.test(raw)) return raw

  let url: URL
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
  } catch {
    return null
  }

  const host = url.hostname.toLowerCase().replace(/^(www|m|music)\./, '')

  if (host === 'youtu.be') {
    const id = url.pathname.split('/')[1] ?? ''
    return VIDEO_ID.test(id) ? id : null
  }

  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v && VIDEO_ID.test(v)) return v
    const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([A-Za-z0-9_-]{11})(?:[/?]|$)/)
    if (m) return m[1]
  }
  return null
}

export function thumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`
}

export type LookupStatus = 'ok' | 'blocked' | 'notfound' | 'unknown'

export interface VideoLookup {
  title: string | null
  /**
   * 'blocked'  - YouTube answered 401: embedding is disabled or the video is restricted.
   * 'notfound' - 404: removed or private.
   * 'unknown'  - the lookup itself failed (offline, timeout...). Say nothing, just try to play.
   */
  status: LookupStatus
}

/** Look up a title (and a hint about embeddability) through YouTube's public oEmbed endpoint. */
export async function lookupVideo(videoId: string, timeoutMs = 2500): Promise<VideoLookup> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const watchUrl = `https://www.youtube.com/watch?v=${videoId}`
    const res = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(watchUrl)}&format=json`,
      { signal: ctrl.signal },
    )
    if (res.status === 401 || res.status === 403) return { title: null, status: 'blocked' }
    if (res.status === 404) return { title: null, status: 'notfound' }
    if (!res.ok) return { title: null, status: 'unknown' }
    const json = (await res.json()) as { title?: unknown }
    const title = typeof json.title === 'string' ? json.title.slice(0, 200) : null
    return { title, status: 'ok' }
  } catch {
    return { title: null, status: 'unknown' }
  } finally {
    clearTimeout(timer)
  }
}

let apiPromise: Promise<void> | null = null

interface YouTubeWindow {
  YT?: { Player?: unknown }
  onYouTubeIframeAPIReady?: () => void
}

/** Load the official YouTube IFrame Player API exactly once. */
export function loadYouTubeApi(): Promise<void> {
  const w = window as unknown as YouTubeWindow
  if (w.YT?.Player) return Promise.resolve()
  if (apiPromise) return apiPromise

  apiPromise = new Promise<void>((resolve, reject) => {
    const previous = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve()
    }
    const script = document.createElement('script')
    script.src = 'https://www.youtube.com/iframe_api'
    script.async = true
    script.onerror = () => {
      apiPromise = null
      script.remove()
      reject(new Error('youtube-api-unavailable'))
    }
    document.head.appendChild(script)
  })
  return apiPromise
}

/** Human-friendly text for the error codes documented for the IFrame Player API. */
export function describePlayerError(code: number): string {
  switch (code) {
    case 2:
      return "That doesn't look like a valid YouTube video."
    case 5:
      return 'The YouTube player hit a problem with this video. Try again in a moment.'
    case 100:
      return 'This video was removed or is private.'
    case 101:
    case 150:
      return "The video's owner doesn't allow it to be played outside YouTube. Pick another one."
    case -1:
      return "Couldn't load the YouTube player. Check your connection or any ad blocker."
    default:
      return 'Something went wrong playing this video.'
  }
}
