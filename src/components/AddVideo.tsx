import { useState } from 'react'
import { ListPlus, Play } from 'lucide-react'
import { lookupVideo, parseVideoId } from '../lib/youtube'
import type { Notify } from '../lib/types'
import { Button } from './ui'

interface Props {
  isHost: boolean
  notify: Notify
  onPlayNow: (videoId: string, title: string | null) => Promise<void>
  onQueue: (videoId: string, title: string | null) => Promise<void>
}

/** Paste a YouTube link. The host can play it right away; everyone can queue it. */
export function AddVideo({ isHost, notify, onPlayNow, onQueue }: Props) {
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<'play' | 'queue' | null>(null)

  const run = async (mode: 'play' | 'queue') => {
    const id = parseVideoId(text)
    if (!id) {
      notify("That doesn't look like a YouTube link. Try copying it from the Share button in YouTube.", 'error')
      return
    }
    setBusy(mode)
    try {
      const info = await lookupVideo(id)
      if (info.status === 'blocked') {
        notify("That video's owner doesn't allow it to be played outside YouTube. Try another one.", 'error')
        return
      }
      if (info.status === 'notfound') {
        notify('That video was removed or is private.', 'error')
        return
      }
      await (mode === 'play' ? onPlayNow(id, info.title) : onQueue(id, info.title))
      setText('')
    } catch {
      /* the caller already showed the error */
    } finally {
      setBusy(null)
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        void run(isHost ? 'play' : 'queue')
      }}
      className="glass flex flex-col gap-2 rounded-3xl p-3 sm:flex-row sm:items-center"
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Paste a YouTube link…"
        inputMode="url"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="YouTube link"
        className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-muted/70 focus:border-brand-a focus:outline-none"
      />
      <div className="flex gap-2">
        {isHost && (
          <Button type="submit" busy={busy === 'play'} disabled={!text.trim() || busy !== null} icon={<Play className="h-4 w-4 fill-white" />} className="flex-1">
            Play now
          </Button>
        )}
        <Button
          type={isHost ? 'button' : 'submit'}
          variant={isHost ? 'glass' : 'primary'}
          busy={busy === 'queue'}
          disabled={!text.trim() || busy !== null}
          icon={<ListPlus className="h-4 w-4" />}
          onClick={isHost ? () => void run('queue') : undefined}
          className="flex-1"
        >
          Add to queue
        </Button>
      </div>
    </form>
  )
}
