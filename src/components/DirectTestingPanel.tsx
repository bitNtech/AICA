import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { PulseLine } from './PulseLine'
import { TestCallHistory } from './TestCallHistory'
import { MicIcon, SendIcon, CloseIcon, AlertTriangleIcon, PhoneIcon } from './icons'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import { useAgentConfigStore } from '../store/agentConfig'
import { useTestCallSocket } from '../lib/useTestCallSocket'
import { isMicCaptureSupported, startMicCapture, type AudioCaptureHandle } from '../lib/audioCapture'
import { fetchHealth, type BackendHealth } from '../lib/backendApi'
import { CALL_LANGUAGES, type ServerEvent } from '../lib/testCallProtocol'
import {
  emptyTranscript,
  liveTranscriptReducer,
  type TranscriptRow,
  type TranscriptState,
} from '../lib/transcriptReducer'
import { env } from '../lib/env'

/** One-click caller lines. Their real value is not saving typing: they let
 * someone who does not speak the call language exercise every intent, which
 * is most of the people who will ever demo this. English glosses shown. */
const SAMPLE_TURNS: { label: string; text: string }[] = [
  { label: 'Book an appointment', text: 'Cardiology-ல ஒரு appointment book பண்ணணும்.' },
  { label: 'Reschedule', text: 'என்னோட appointment-ஐ அடுத்த வாரத்துக்கு மாத்த முடியுமா?' },
  { label: 'Prescription refill', text: 'என் மாத்திரை refill பண்ண வேண்டும்.' },
  { label: 'Insurance / billing', text: 'இந்த bill-ல ஒரு charge புரியல, விளக்க முடியுமா?' },
  { label: 'Hours & location', text: 'clinic எத்தனை மணி வரைக்கும் open ஆ இருக்கும்?' },
  { label: 'Emergency override', text: 'என் அப்பாவுக்கு மூச்சு விட முடியல, உடனே உதவி வேணும்!' },
]

type PillState = 'on' | 'off' | 'unknown'

/** A capability is `unknown` until something authoritative says otherwise —
 * grey is meaningfully different from red. `ready` from the live socket wins
 * over `/api/health`, which is only a pre-call snapshot. */
function pill(live: boolean | undefined, health: boolean | undefined): PillState {
  if (live !== undefined) return live ? 'on' : 'off'
  if (health !== undefined) return health ? 'on' : 'off'
  return 'unknown'
}

/** A one-on-one manual test call against the real agent backend over
 * `/ws/audio`. The admin plays the caller — typing or speaking — and sees the
 * transcript, the pipeline's health, and the numbers that say whether the
 * agent is behaving.
 *
 * Two decisions drive the layout. First, a 200 from the backend does not mean
 * the pipeline is whole: ASR, the conversation manager, the LLM and TTS load
 * independently and any of them can fail without stopping the server, so the
 * status pills are permanent furniture rather than an error state. Second,
 * typed turns drive the identical conversation → LLM → TTS path as spoken
 * ones and work with no ASR model installed, so the text box is the primary
 * input and the microphone is the optional one. */
export function DirectTestingPanel({ onClose }: { onClose: () => void }) {
  const additionalContext = useAgentConfigStore((s) => s.additionalContext)
  const [live, dispatch] = useReducer(liveTranscriptReducer, emptyTranscript)
  const [draft, setDraft] = useState('')
  const [language, setLanguage] = useState(env.callLanguage)
  const [micActive, setMicActive] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  const [health, setHealth] = useState<BackendHealth | null>(null)
  const [callStartedAt, setCallStartedAt] = useState<string | null>(null)
  const [historyKey, setHistoryKey] = useState(0)
  /** A replayed call from the log, shown instead of the live transcript. */
  const [replay, setReplay] = useState<{ id: string; transcript: TranscriptState } | null>(null)

  const listRef = useRef<HTMLDivElement>(null)
  const captureRef = useRef<AudioCaptureHandle | null>(null)
  const amplitudeRef = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // The fallback has to be stable: `useElapsedSeconds` restarts its interval
  // whenever the timestamp changes, so a fresh `new Date()` per render would
  // rebuild the timer on every clause that arrives.
  const [mountedAt] = useState(() => new Date().toISOString())
  const elapsed = useElapsedSeconds(callStartedAt ?? mountedAt)

  const handleServerEvent = useCallback((event: ServerEvent) => {
    dispatch(event)
    if (event.type === 'closed') {
      // The call that just ended is now in the log — pull it in so a dropped
      // socket leaves its transcript recoverable rather than lost.
      setHistoryKey((k) => k + 1)
      captureRef.current?.stop()
      captureRef.current = null
      setMicActive(false)
    }
  }, [])

  const {
    connectionState,
    capabilities,
    connectionId,
    errorMessage,
    connect,
    disconnect,
    sendText,
    sendAudioChunk,
  } = useTestCallSocket({ url: env.backendWsUrl, token: env.backendWsToken, onEvent: handleServerEvent })

  // Pre-call snapshot of which components loaded. Purely advisory — the
  // socket's `ready` event overrides it — so a CORS failure here is silent.
  useEffect(() => {
    const controller = new AbortController()
    fetchHealth(controller.signal)
      .then(setHealth)
      .catch(() => {})
    return () => controller.abort()
  }, [])

  useEffect(
    () => () => {
      captureRef.current?.stop()
      captureRef.current = null
    },
    [],
  )

  const callLive = connectionState === 'connected'
  const transcript = replay?.transcript ?? live

  // Autoscroll, but only from near the bottom — otherwise reading back
  // through a call fights the incoming clauses.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [transcript])

  function startCall() {
    setReplay(null)
    setCallStartedAt(new Date().toISOString())
    // Nothing on the wire resets a call — a new call is a new socket — so the
    // previous transcript is cleared here before the new one starts arriving.
    dispatch({ type: 'reset' })
    connect(language)
    inputRef.current?.focus()
  }

  function endCall() {
    captureRef.current?.stop()
    captureRef.current = null
    setMicActive(false)
    disconnect()
    setHistoryKey((k) => k + 1)
  }

  const send = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || !callLive) return
      setReplay(null)
      // Dispatched locally, not echoed by the backend: a typed turn produces
      // no `transcript` event, so this is also where the reply clock starts.
      dispatch({ type: 'local_user_text', text: trimmed })
      sendText(trimmed)
      setDraft('')
    },
    [callLive, sendText],
  )

  async function toggleMic() {
    if (micActive) {
      captureRef.current?.stop()
      captureRef.current = null
      setMicActive(false)
      return
    }
    setMicError(null)
    try {
      captureRef.current = await startMicCapture(sendAudioChunk, (level) => {
        amplitudeRef.current = level
      })
      setMicActive(true)
    } catch (cause) {
      // The 16 kHz assertion in startMicCapture produces a message worth
      // showing verbatim; a permission denial does not.
      setMicError(
        cause instanceof Error && cause.message.includes('Hz')
          ? cause.message
          : 'Could not access the microphone — check browser permissions.',
      )
    }
  }

  const micSupported = isMicCaptureSupported()
  const canMic = callLive && capabilities?.asr === true && micSupported
  const llmDown = callLive && capabilities !== null && !capabilities.llm

  const pills = useMemo(
    () => [
      { label: 'socket', state: (callLive ? 'on' : connectionState === 'idle' ? 'unknown' : 'off') as PillState },
      { label: 'conversation', state: pill(capabilities?.llm, health?.conversationReady) },
      { label: 'speech-to-text', state: pill(capabilities?.asr, health?.asrReady) },
      { label: 'voice', state: pill(capabilities?.tts, health?.ttsReady) },
    ],
    [callLive, connectionState, capabilities, health],
  )

  return (
    <div className="card flex h-full min-h-0 flex-col overflow-hidden">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-hairline px-5 py-3">
        <h2 className="text-sm font-semibold text-body">Live test call</h2>
        {callLive && (
          <span className="flex items-center gap-1.5 text-sm text-muted">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-sage opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-sage" />
            </span>
            <span className="font-mono tabular-nums">{formatDuration(elapsed)}</span>
          </span>
        )}
        {connectionId && (
          <span className="font-mono text-[10.5px] text-faint">{connectionId.slice(0, 8)}</span>
        )}

        <div className="ml-auto flex items-center gap-2">
          {callLive ? (
            <button type="button" onClick={endCall} className="btn-danger !px-4 !py-1.5 text-xs">
              End call
            </button>
          ) : (
            <>
              <label className="sr-only" htmlFor="test-call-language">
                Call language
              </label>
              <select
                id="test-call-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={connectionState === 'connecting'}
                className="rounded-full border border-hairline bg-surface px-3 py-1.5 text-xs text-body focus:border-pulse/50 focus:outline-none"
              >
                {CALL_LANGUAGES.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.label}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={startCall}
                disabled={connectionState === 'connecting'}
                className="btn-primary !px-4 !py-1.5 text-xs"
              >
                <PhoneIcon className="h-3.5 w-3.5" />
                {connectionState === 'connecting' ? 'Connecting…' : 'Start call'}
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => {
              endCall()
              onClose()
            }}
            className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-body"
            aria-label="Close test call panel"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-hairline bg-canvas/60 px-5 py-2">
        {pills.map((p) => (
          <StatusPill key={p.label} label={p.label} state={p.state} />
        ))}
        {health?.llmModel && <StatusPill label={health.llmModel} state="neutral" />}
        <StatusPill
          label="reply"
          state={live.replyMs === null ? 'unknown' : 'on'}
          value={live.replyMs === null ? '—' : `${(live.replyMs / 1000).toFixed(1)}s`}
        />
        {additionalContext.length > 0 && (
          <span className="ml-auto text-[11px] text-muted">
            {additionalContext.length} context doc{additionalContext.length === 1 ? '' : 's'} attached
          </span>
        )}
      </div>

      {errorMessage && <Banner tone="critical">{errorMessage}</Banner>}
      {llmDown && (
        <Banner tone="critical">
          The conversation manager did not load on the backend, so the agent cannot reply at all. Nothing in
          this call will work until it is fixed.
        </Banner>
      )}
      {live.ttsDown && (
        <Banner tone="amber">
          Voice is unavailable, so replies are text-only. The conversation and transcript still work.
        </Banner>
      )}
      {callLive && capabilities?.tts && (
        <Banner tone="muted">
          The default voice engine sends each reply&rsquo;s text to Microsoft. Fine for fictional test data,
          not for real patient speech.
        </Banner>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-px overflow-y-auto bg-hairline lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:overflow-hidden">
        {/* Controls and history */}
        <div className="flex min-h-0 flex-col gap-3 bg-canvas/40 p-4 lg:overflow-y-auto">
          <section className="card p-4">
            <h3 className="text-xs font-semibold text-body">Speak as the caller</h3>
            <div className="mt-3 flex items-center gap-3">
              <button
                type="button"
                onClick={toggleMic}
                disabled={!canMic}
                aria-pressed={micActive}
                aria-label={micActive ? 'Stop microphone' : 'Start microphone'}
                className={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                  micActive ? 'bg-pulse text-ink-teal' : 'bg-surface text-muted hover:text-body'
                }`}
              >
                {micActive && (
                  <span
                    className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-30"
                    aria-hidden="true"
                  />
                )}
                <MicIcon className="relative h-5 w-5" />
              </button>
              <PulseLine
                mode={micActive ? 'live' : 'idle'}
                sample={micActive ? () => amplitudeRef.current : undefined}
                height={24}
                className="min-w-0 flex-1 text-pulse"
                aria-label={micActive ? 'Listening for the caller' : 'Microphone idle'}
              />
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-muted">
              {!micSupported
                ? 'This browser cannot capture microphone audio.'
                : capabilities?.asr === false
                  ? 'Speech-to-text is not loaded, so the microphone is unavailable. Typed turns work and drive the same path.'
                  : !callLive
                    ? 'Start a call to speak.'
                    : micActive
                      ? 'Listening — talk over the agent to test barge-in.'
                      : 'Tap to speak as the caller.'}
            </p>
            {micError && <p className="mt-1 text-[11px] text-critical">{micError}</p>}
          </section>

          <section className="card p-4">
            <h3 className="text-xs font-semibold text-body">Sample turns</h3>
            <p className="mt-1 text-[11px] text-muted">
              One click each, covering every intent plus the emergency override.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {SAMPLE_TURNS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  disabled={!callLive}
                  onClick={() => send(s.text)}
                  title={s.text}
                  className="rounded-full border border-hairline bg-surface px-2.5 py-1 text-[11px] text-body transition-colors hover:border-pulse/40 hover:text-pulse disabled:pointer-events-none disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </section>

          <TestCallHistory
            refreshKey={historyKey}
            selectedId={replay?.id ?? null}
            onReplay={(id, t) => setReplay({ id, transcript: t })}
          />
        </div>

        {/* Transcript */}
        <div className="flex min-h-0 flex-col bg-surface-warm">
          <div className="flex items-center gap-2 border-b border-hairline px-5 py-2">
            <h3 className="text-xs font-semibold text-body">
              {replay ? `Replay · ${replay.id.slice(0, 8)}` : 'Transcript'}
            </h3>
            {replay ? (
              <button
                type="button"
                onClick={() => setReplay(null)}
                className="ml-auto text-[11px] font-medium text-pulse underline underline-offset-2"
              >
                Back to live call
              </button>
            ) : (
              live.speaking && (
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-signal" aria-live="polite">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal" />
                  Agent speaking — interrupt any time
                </span>
              )
            )}
          </div>

          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-5 py-4">
            {transcript.rows.length === 0 && !transcript.interim && (
              <p className="mt-6 text-center text-xs text-faint">
                {replay
                  ? 'This call has no stored events.'
                  : callLive
                    ? 'Waiting for the agent’s greeting…'
                    : 'Start a call, then type or speak as the caller.'}
              </p>
            )}
            {transcript.rows.map((row) => (
              <TranscriptBubble key={row.id} row={row} />
            ))}
            {transcript.interim && (
              <Bubble align="end" tone="caller" dim who="Caller (speaking…)">
                {transcript.interim}
              </Bubble>
            )}
            {transcript.awaitingReply && !replay && <TypingBubble />}
          </div>

          <div className="border-t border-hairline p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    send(draft)
                  }
                }}
                disabled={!callLive}
                placeholder={callLive ? 'Type what the caller would say…' : 'Start a call to send a turn.'}
                className="input flex-1 disabled:opacity-50"
              />
              <button
                type="button"
                onClick={() => send(draft)}
                disabled={!draft.trim() || !callLive}
                aria-label="Send"
                className="btn-primary !rounded-full !p-2.5"
              >
                <SendIcon className="h-4 w-4" />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-faint">
              Typed turns skip speech-to-text and drive the same conversation, LLM and voice path — latency
              here is the live pipeline&rsquo;s, not a simulation.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------------------- */

function StatusPill({
  label,
  state,
  value,
}: {
  label: string
  state: PillState | 'neutral'
  value?: string
}) {
  const dot =
    state === 'on' ? 'bg-sage' : state === 'off' ? 'bg-critical' : state === 'neutral' ? 'bg-faint' : 'bg-track'
  const text = state === 'on' ? 'text-body' : state === 'off' ? 'text-critical' : 'text-muted'
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface px-2.5 py-1 font-mono text-[10.5px] ${text}`}
      title={state === 'unknown' ? `${label}: not reported yet` : `${label}: ${state}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden="true" />
      {label}
      {value && <span className="tabular-nums">{value}</span>}
    </span>
  )
}

function Banner({ tone, children }: { tone: 'critical' | 'amber' | 'muted'; children: React.ReactNode }) {
  const styles =
    tone === 'critical'
      ? 'bg-critical/10 text-critical'
      : tone === 'amber'
        ? 'bg-amber/10 text-body'
        : 'bg-canvas text-muted'
  return (
    <p
      className={`flex items-start gap-1.5 border-b border-hairline px-5 py-2 text-[11px] leading-relaxed ${styles}`}
      role={tone === 'muted' ? undefined : 'alert'}
    >
      {tone !== 'muted' && <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      {children}
    </p>
  )
}

function TranscriptBubble({ row }: { row: TranscriptRow }) {
  switch (row.kind) {
    case 'caller':
      return (
        <Bubble align="end" tone="caller" who="Caller" meta={row.meta}>
          {row.text}
        </Bubble>
      )
    case 'agent':
      return (
        <Bubble align="start" tone="agent" who="Agent" meta={row.meta}>
          {row.text}
          {row.truncated && <span className="text-muted"> …</span>}
        </Bubble>
      )
    // The two safety warnings are the highest-consequence events on the wire.
    // They are styled to be impossible to skim past, and worded to name the
    // failure rather than soften it to "unverified".
    case 'ungrounded':
    case 'notdone':
      return (
        <div
          className={`rounded-xl border-l-2 px-3 py-2 text-[11.5px] leading-relaxed ${
            row.kind === 'notdone'
              ? 'border-critical bg-critical/12 text-critical'
              : 'border-amber bg-amber/12 text-body'
          }`}
          role="alert"
        >
          <span className="block font-mono text-[9.5px] uppercase tracking-wider opacity-70">
            {row.kind === 'notdone' ? 'Action never taken' : 'Ungrounded identifier'}
          </span>
          {row.text}
        </div>
      )
    case 'error':
      return (
        <p
          className="flex items-start gap-1.5 self-center rounded-full bg-critical/10 px-3 py-1 text-[11px] text-critical"
          role="alert"
        >
          <AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0" />
          {row.text}
        </p>
      )
    default:
      return <p className="self-center text-[10.5px] text-faint">{row.text}</p>
  }
}

function Bubble({
  align,
  tone,
  who,
  meta,
  dim,
  children,
}: {
  align: 'start' | 'end'
  tone: 'caller' | 'agent'
  who: string
  meta?: string
  dim?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex ${align === 'end' ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
          tone === 'caller' ? 'bg-pulse/15 text-body' : 'bg-surface text-body'
        } ${dim ? 'opacity-55' : ''}`}
      >
        <p
          className={`text-[9.5px] font-semibold uppercase tracking-wider ${
            tone === 'caller' ? 'text-pulse' : 'text-signal'
          }`}
        >
          {who}
        </p>
        <p className="mt-0.5 whitespace-pre-wrap">{children}</p>
        {meta && <p className="mt-1 font-mono text-[10px] tabular-nums text-faint">{meta}</p>}
      </div>
    </div>
  )
}

function TypingBubble() {
  return (
    <div className="flex justify-start" aria-live="polite" aria-label="Agent is thinking">
      <div className="flex items-center gap-1.5 rounded-2xl bg-surface px-4 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.3s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted [animation-delay:-0.15s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" />
      </div>
    </div>
  )
}
