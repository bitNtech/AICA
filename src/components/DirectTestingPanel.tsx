import { useCallback, useEffect, useRef, useState } from 'react'
import { PulseLine } from './PulseLine'
import { MicIcon, SendIcon, CloseIcon, AlertTriangleIcon } from './icons'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import { useAgentConfigStore } from '../store/agentConfig'
import { useTestCallSocket, type ConnectionState } from '../lib/useTestCallSocket'
import { isMicCaptureSupported, startMicCapture, type AudioCaptureHandle } from '../lib/audioCapture'
import { ChunkedAudioPlayer } from '../lib/audioPlayback'
import { base64ToArrayBuffer } from '../lib/testCallProtocol'
import type { ServerEvent } from '../lib/testCallProtocol'

type Speaker = 'admin' | 'agent'

interface TestMessage {
  id: string
  speaker: Speaker
  text: string
  /** Caller transcript still being spoken — rendered lighter, replaced in
   * place once the backend marks it final. */
  interim?: boolean
}

const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL

/** A one-on-one manual test call — the admin plays the caller (by typing or
 * speaking), sees the transcript, and gets a reply from the real agent
 * backend over `/ws/audio`. Response rendering branches on the backend's
 * declared capabilities (`ready.capabilities`) instead of assuming the full
 * ASR → LLM → TTS pipeline is live — see FRONTEND_IMPROVEMENTS.md §1.1. */
export function DirectTestingPanel({ onClose }: { onClose: () => void }) {
  const additionalContext = useAgentConfigStore((s) => s.additionalContext)
  const [startedAt] = useState(() => new Date().toISOString())
  const elapsed = useElapsedSeconds(startedAt)
  const [messages, setMessages] = useState<TestMessage[]>([])
  const [draft, setDraft] = useState('')
  const [agentTyping, setAgentTyping] = useState(false)
  const [micActive, setMicActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const interimIdRef = useRef<string | null>(null)
  const captureRef = useRef<AudioCaptureHandle | null>(null)
  const playerRef = useRef<ChunkedAudioPlayer | null>(null)
  const amplitudeRef = useRef(0)

  const handleServerEvent = useCallback((event: ServerEvent) => {
    switch (event.type) {
      case 'user_transcript': {
        setMessages((prev) => {
          const id = interimIdRef.current
          if (id) {
            return prev.map((m) => (m.id === id ? { ...m, text: event.text, interim: !event.final } : m))
          }
          const newId = `caller-${Date.now()}`
          if (!event.final) interimIdRef.current = newId
          return [...prev, { id: newId, speaker: 'admin', text: event.text, interim: !event.final }]
        })
        if (event.final) interimIdRef.current = null
        break
      }
      case 'agent_text':
        setAgentTyping(false)
        setMessages((prev) => [...prev, { id: `agent-${Date.now()}`, speaker: 'agent', text: event.text }])
        break
      case 'agent_audio_chunk':
        if (!playerRef.current) playerRef.current = new ChunkedAudioPlayer()
        playerRef.current.play(base64ToArrayBuffer(event.audioBase64))
        break
      case 'asr_error':
      case 'pipeline_error':
      case 'protocol_error':
        setAgentTyping(false)
        break
      default:
        break
    }
  }, [])

  const { connectionState, capabilities, errorMessage, connect, disconnect, sendText, sendAudioChunk } =
    useTestCallSocket({ url: BACKEND_WS_URL, onEvent: handleServerEvent })

  useEffect(() => {
    connect()
    return () => {
      captureRef.current?.stop()
      playerRef.current?.stop()
      disconnect()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, agentTyping])

  function send() {
    const text = draft.trim()
    if (!text || connectionState !== 'connected') return
    setMessages((prev) => [...prev, { id: `admin-${Date.now()}`, speaker: 'admin', text }])
    setDraft('')
    if (capabilities?.llm) setAgentTyping(true)
    sendText(text)
  }

  async function toggleMic() {
    if (micActive) {
      captureRef.current?.stop()
      captureRef.current = null
      setMicActive(false)
      return
    }
    setMicError(null)
    try {
      captureRef.current = await startMicCapture(
        (pcm) => sendAudioChunk(pcm),
        (level) => {
          amplitudeRef.current = level
        },
      )
      setMicActive(true)
    } catch {
      setMicError('Could not access the microphone — check browser permissions.')
    }
  }

  const micSupported = isMicCaptureSupported()
  const canSendVoice = connectionState === 'connected' && Boolean(capabilities?.asr)
  const showAgentUi = Boolean(capabilities?.llm)

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
        <ConnectionStatus
          connectionState={connectionState}
          elapsedLabel={formatDuration(elapsed)}
          errorMessage={errorMessage}
          additionalContextCount={additionalContext.length}
          onRetry={connect}
        />
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-body"
          aria-label="End test call"
        >
          <CloseIcon className="h-4 w-4" />
        </button>
      </div>

      {connectionState === 'connected' && capabilities && !capabilities.llm && (
        <p className="flex items-center gap-1.5 border-b border-hairline bg-canvas px-5 py-2 text-xs text-muted">
          <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0 text-amber" />
          Agent replies aren't connected yet — this session only proves out transcription.
        </p>
      )}

      <div className="flex flex-1 min-h-0">
        <div className="flex w-24 shrink-0 flex-col items-center justify-center gap-2 border-r border-hairline bg-canvas px-2 py-6 sm:w-28">
          <button
            type="button"
            onClick={toggleMic}
            disabled={!micSupported || !canSendVoice}
            aria-pressed={micActive}
            aria-label={micActive ? 'Stop microphone' : 'Start microphone'}
            className={`relative flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
              micActive ? 'bg-pulse text-ink-teal' : 'bg-surface text-muted hover:text-body'
            }`}
          >
            {micActive && (
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-30" aria-hidden="true" />
            )}
            <MicIcon className="relative h-5 w-5" />
          </button>
          <PulseLine
            mode={micActive ? 'live' : 'idle'}
            sample={micActive ? () => amplitudeRef.current : undefined}
            height={22}
            className="w-16 text-pulse"
            aria-label={micActive ? 'Listening for the caller' : 'Microphone idle'}
          />
          <p className="text-center text-[10.5px] font-medium text-muted">
            {!micSupported
              ? 'Mic unsupported'
              : !canSendVoice
                ? 'Voice not ready'
                : micActive
                  ? 'Listening…'
                  : 'Tap to speak'}
          </p>
          {micError && <p className="text-center text-[10px] text-critical">{micError}</p>}
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-5 py-4">
            {messages.length === 0 && connectionState === 'connected' && (
              <p className="text-center text-xs text-faint">
                Type or speak as the caller to start the test call.
              </p>
            )}
            {messages.map((m) => (
              <ChatBubble key={m.id} msg={m} />
            ))}
            {agentTyping && showAgentUi && <TypingBubble />}
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
              disabled={connectionState !== 'connected'}
              placeholder="Type what the caller would say…"
              className="input flex-1 disabled:opacity-50"
            />
            <button
              type="button"
              onClick={send}
              disabled={!draft.trim() || connectionState !== 'connected'}
              aria-label="Send"
              className="btn-primary !rounded-full !p-2.5"
            >
              <SendIcon className="h-4 w-4" />
            </button>
          </div>
          <p className="px-5 pb-4 text-xs text-faint">
            {connectionState === 'connected'
              ? 'This is a real session against the agent backend — latency reflects the live pipeline.'
              : 'Connect to the backend to start a real test call.'}
          </p>
        </div>
      </div>
    </div>
  )
}

function ConnectionStatus({
  connectionState,
  elapsedLabel,
  errorMessage,
  additionalContextCount,
  onRetry,
}: {
  connectionState: ConnectionState
  elapsedLabel: string
  errorMessage: string | null
  additionalContextCount: number
  onRetry: () => void
}) {
  if (connectionState === 'connected') {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-body">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage" />
        </span>
        Test call in progress · <span className="font-mono text-muted">{elapsedLabel}</span>
        {additionalContextCount > 0 && (
          <span className="ml-1 font-normal text-muted">
            · {additionalContextCount} additional context doc{additionalContextCount === 1 ? '' : 's'} attached
          </span>
        )}
      </p>
    )
  }

  if (connectionState === 'connecting' || connectionState === 'idle') {
    return (
      <p className="flex items-center gap-1.5 text-sm font-medium text-muted">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted" />
        Connecting to the agent backend…
      </p>
    )
  }

  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-critical">
      <AlertTriangleIcon className="h-3.5 w-3.5 shrink-0" />
      {errorMessage ?? 'Disconnected from the agent backend.'}
      <button type="button" onClick={onRetry} className="ml-1 font-semibold underline underline-offset-2">
        Retry
      </button>
    </p>
  )
}

function ChatBubble({ msg }: { msg: TestMessage }) {
  const isAdmin = msg.speaker === 'admin'
  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isAdmin ? 'bg-pulse/15 text-body' : 'bg-canvas text-body'
        } ${msg.interim ? 'opacity-55' : ''}`}
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
