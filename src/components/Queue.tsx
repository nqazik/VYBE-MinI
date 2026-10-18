import { ListVideo, Play, SkipForward, X } from 'lucide-react'
import { thumbnailUrl } from '../lib/youtube'
import type { QueueItem } from '../lib/types'

interface Props {
  items: QueueItem[]
  meId: string
  isHost: boolean
  onPlayNext: () => void
  onPlayItem: (item: QueueItem) => void
  onRemove: (item: QueueItem) => void
}

export function Queue({ items, meId, isHost, onPlayNext, onPlayItem, onRemove }: Props) {
  if (items.length === 0) {
    return (
      <div className="grid h-full place-items-center p-6 text-center text-muted">
        <div>
          <ListVideo className="mx-auto mb-2 h-10 w-10 opacity-60" />
          <p className="text-sm font-semibold text-ink">The queue is empty</p>
          <p className="mt-1 text-sm">Paste a YouTube link below and tap “Add to queue”. Everyone can add videos.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pb-1 pt-4">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted">Up next · {items.length}</p>
        {isHost && (
          <button
            onClick={onPlayNext}
            className="flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-[color:var(--glow-a)] active:scale-95"
          >
            <SkipForward className="h-3.5 w-3.5" /> Play next
          </button>
        )}
      </div>
      <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
        {items.map((item, i) => {
          const canRemove = isHost || item.added_by === meId
          return (
            <li key={item.id} className="animate-fade-up flex items-center gap-3 rounded-2xl bg-surface p-2 ring-1 ring-line">
              <div className="relative h-14 w-24 shrink-0 overflow-hidden rounded-xl bg-black/40">
                <img src={thumbnailUrl(item.video_id)} alt="" loading="lazy" className="h-full w-full object-cover" />
                <span className="absolute left-1 top-1 rounded-md bg-black/60 px-1.5 text-[10px] font-bold text-white">{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="line-clamp-2 text-sm font-medium leading-snug">{item.title ?? 'YouTube video'}</p>
                <p className="mt-0.5 truncate text-xs text-muted">added by {item.added_name || 'someone'}</p>
              </div>
              {isHost && (
                <button
                  onClick={() => onPlayItem(item)}
                  aria-label="Play now"
                  title="Play now"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand text-white active:scale-90"
                >
                  <Play className="h-4 w-4 fill-white" />
                </button>
              )}
              {canRemove && (
                <button
                  onClick={() => onRemove(item)}
                  aria-label="Remove from queue"
                  title="Remove"
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink active:scale-90"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
