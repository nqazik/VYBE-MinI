import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react'
import { Send } from 'lucide-react'
import type { ChatMessage } from '../lib/types'
import { Avatar } from './Avatar'

interface Props {
  messages: ChatMessage[]
  meId: string
  onSend: (body: string) => Promise<void>
}

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

export function Chat({ messages, meId, onSend }: Props) {
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const stickRef = useRef(true)

  // Follow new messages, unless the person has scrolled up to read older ones.
  const onScroll = () => {
    const el = listRef.current
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
  }
  useLayoutEffect(() => {
    const el = listRef.current
    if (el && (stickRef.current || messages.at(-1)?.user_id === meId)) el.scrollTop = el.scrollHeight
  }, [messages, meId])
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setDraft('')
    try {
      await onSend(body)
    } catch {
      setDraft(body) // give the text back so nothing is lost
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={listRef} onScroll={onScroll} className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center text-center text-muted">
            <div>
              <div className="mb-2 text-4xl">👋</div>
              <p className="text-sm">No messages yet. Say hi!</p>
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.user_id === meId
            const prev = messages[i - 1]
            const grouped = prev?.user_id === m.user_id && Date.parse(m.created_at) - Date.parse(prev.created_at) < 120_000
            return (
              <div key={m.id} className={`flex items-end gap-2 ${mine ? 'flex-row-reverse' : ''} ${grouped ? '-mt-1.5' : ''}`}>
                <div className="w-8 shrink-0">
                  {!mine && !grouped && <Avatar name={m.name} avatar={m.avatar} size={32} />}
                </div>
                <div className={`flex max-w-[78%] flex-col ${mine ? 'items-end' : 'items-start'}`}>
                  {!grouped && (
                    <span className="mb-0.5 px-1 text-[11px] text-muted">
                      {mine ? 'You' : m.name} · {time(m.created_at)}
                    </span>
                  )}
                  <p
                    className={`whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-[15px] leading-snug ${
                      mine ? 'bg-brand rounded-br-md text-white' : 'rounded-bl-md bg-surface-2 text-ink'
                    }`}
                  >
                    {m.body}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>
      <form onSubmit={submit} className="flex items-center gap-2 border-t border-line p-3 pb-safe">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value.slice(0, 500))}
          placeholder="Message the room…"
          enterKeyHint="send"
          autoComplete="off"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface px-4 py-2.5 text-ink placeholder:text-muted/70 focus:border-brand-a focus:outline-none"
        />
        <button
          type="submit"
          disabled={!draft.trim()}
          aria-label="Send message"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand text-white shadow-lg shadow-[color:var(--glow-a)] transition enabled:active:scale-90 disabled:opacity-40"
        >
          <Send className="h-5 w-5" />
        </button>
      </form>
    </div>
  )
}
