import { useEffect, useRef, useState } from 'react'
import { PulseLine } from './PulseLine'
import { MicIcon, SendIcon, CloseIcon } from './icons'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import { useAgentConfigStore } from '../store/agentConfig'

type Speaker = 'admin' | 'agent'

interface TestMessage {
  id: string
  speaker: Speaker
  text: string
}

const GREETING = "Thanks for calling — how can I help today?"

const CANNED_REPLIES = [
  "Let me check that for you, one moment.",
  "I can take care of that right now — want me to go ahead and confirm it?",
  "That's outside what I can confirm directly. Would you like me to connect you with the front desk?",
  "Got it — anything else I can help with while I have you?",
  "I don't have that on file, but I can take a message and have someone call you back.",
]

/** A one-on-one manual test call — the admin plays the caller, types a line,
 * and sees it land in the same transcript shape as a real call. Replies are
 * mocked locally until the live agent backend is wired up; this only proves
 * the interaction shape (mic, waveform, chat) out ahead of that. */
export function DirectTestingPanel({ onClose }: { onClose: () => void }) {
  const additionalContext = useAgentConfigStore((s) => s.additionalContext)
  const [startedAt] = useState(() => new Date().toISOString())
  const elapsed = useElapsedSeconds(startedAt)
  const [messages, setMessages] = useState<TestMessage[]>([
    { id: 'greeting', speaker: 'agent', text: GREETING },
  ])
  const [draft, setDraft] = useState('')
  const [agentTyping, setAgentTyping] = useState(false)
  const replyIndexRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, agentTyping])

  function send() {
    const text = draft.trim()
    if (!text) return
    setMessages((prev) => [...prev, { id: `admin-${Date.now()}`, speaker: 'admin', text }])
    setDraft('')
    setAgentTyping(true)
    setTimeout(
      () => {
        const reply = CANNED_REPLIES[replyIndexRef.current % CANNED_REPLIES.length]
        replyIndexRef.current += 1
        setMessages((prev) => [...prev, { id: `agent-${Date.now()}`, speaker: 'agent', text: reply }])
        setAgentTyping(false)
      },
      900 + Math.random() * 500,
    )
  }

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <p className="flex items-center gap-1.5 text-sm font-medium text-body">
          <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage" />
          </span>
          Test call in progress · <span className="font-mono text-muted">{formatDuration(elapsed)}</span>
          {additionalContext.length > 0 && (
            <span className="ml-1 font-normal text-muted">
              · {additionalContext.length} additional context doc{additionalContext.length === 1 ? '' : 's'} attached
            </span>
          )}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-body"
          aria-label="End test call"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-2 border-r border-hairline bg-canvas px-2 py-6 sm:w-28">
          <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-pulse text-ink-teal shadow-sm">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-30" aria-hidden="true" />
            <MicIcon className="relative h-5 w-5" />
          </div>
          <PulseLine mode="live" height={22} className="w-16 text-pulse" aria-label="Listening for the caller" />
          <p className="text-center text-[10.5px] font-medium text-muted">Listening…</p>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} />
            ))}
            {agentTyping && <TypingBubble />}
          </div>

          <div className="flex items-center gap-2 border-t border-hairline p-3">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  send()
                }
              }}
              placeholder="Type what the caller would say…"
              className="input flex-1"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim()}
              aria-label="Send"
              className="btn-primary !rounded-full !p-2.5"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="px-5 pb-4 text-xs text-faint">
            Replies are mocked for now — connect the live agent backend to make this a real test call.
          </p>
        </div>
      </div>
    </div>
  )
}

function ChatBubble({ msg }: { msg: TestMessage }) {
  const isAdmin = msg.speaker === 'admin'
  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isAdmin ? 'bg-pulse/15 text-body' : 'bg-canvas text-body'
        }`}
      >
        <p
          className={`text-[10.5px] font-semibold uppercase tracking-wide ${
            isAdmin ? 'text-pulse' : 'text-signal'
          }`}
        >
          {isAdmin ? 'Admin:' : 'Agent:'}
        </p>
        <p className="mt-0.5">{msg.text}</p>
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Agent is typing">
      <div className="flex items-center gap-1.5 rounded-2xl bg-canvas px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
      </div>
    </div>
  )
}
