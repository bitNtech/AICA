/** Turns the `/ws/audio` event stream into a readable conversation.
 *
 * Deliberately a pure function of (state, event): the same reducer renders a
 * live call and replays a stored one from `GET /api/calls/{id}`, because the
 * persisted events are the identical JSON objects that went over the socket.
 * One rendering path, so history can never drift from live.
 *
 * The non-obvious part is that a turn is not one event. An agent reply
 * arrives as N `agent_clause` events that grow one bubble, and a caller
 * utterance arrives as many `partial_transcript`s that replace each other
 * before a final `transcript` lands. Rows are turns, not events.
 */

import type { ServerEvent } from './testCallProtocol'
import { TTS_UNAVAILABLE_PREFIX, WS_CLOSE_UNAUTHORIZED } from './testCallProtocol'

/** Two actions are not on the wire:
 * - `local_user_text` is the panel saying the operator typed a turn, so the
 *   reply clock starts at the keystroke rather than at a `transcript` event
 *   that never comes for a typed turn.
 * - `reset` clears the board for a new call. Nothing on the socket means
 *   this — a new call is a new socket — so it has to come from the UI. */
export type TranscriptEvent =
  | ServerEvent
  | { type: 'local_user_text'; text: string }
  | { type: 'reset' }

export type RowKind =
  /** Caller turn — spoken (final ASR) or typed. */
  | 'caller'
  /** Agent reply, grown clause by clause. */
  | 'agent'
  /** The agent stated an identifier no lookup returned. A fabrication. */
  | 'ungrounded'
  /** The agent said something was done, and nothing did it. */
  | 'notdone'
  /** Low-stakes diagnostics: echo discarded, one clause lost its audio. */
  | 'system'
  /** A real failure: ASR down, pipeline dead, our own protocol bug. */
  | 'error'

export interface TranscriptRow {
  id: number
  kind: RowKind
  text: string
  /** Small print under the bubble — utterance length, endpoint reason, or the
   * turn's timings. Absent when there is nothing measured to say. */
  meta?: string
  /** Agent was cut off mid-sentence by barge-in. */
  truncated?: boolean
}

export interface TranscriptState {
  rows: TranscriptRow[]
  /** Live interim ASR text, rendered dimmed in the caller's slot and never
   * committed to `rows` — a partial must not survive into the log. */
  interim: string | null
  /** Row id of the agent bubble currently being grown, if any. */
  agentRowId: number | null
  /** Between `agent_speaking_start` and its end/interrupt. Drives the
   * speaking indicator, which is what tells the caller barge-in is possible. */
  speaking: boolean
  /** A caller turn has landed and no clause has come back yet. */
  awaitingReply: boolean
  /** Clock start for the current turn (ms), or null when nothing is pending —
   * the unprompted greeting has no caller turn to measure from. */
  turnStartedAt: number | null
  /** Time-to-first-clause of the most recent measured turn, in ms. The single
   * most diagnostic number on the page: it separates "model unloaded" from
   * "prompt re-evaluated cold" from "TTS stalling". */
  replyMs: number | null
  /** Latched once the backend reports TTS down. It repeats that error every
   * turn, so it becomes one banner rather than one bubble per reply. */
  ttsDown: boolean
  /** Set when the socket closed with 4401 — a rejected `?token=`, which
   * needs different copy from an ordinary disconnect. */
  unauthorized: boolean
}

export const emptyTranscript: TranscriptState = {
  rows: [],
  interim: null,
  agentRowId: null,
  speaking: false,
  awaitingReply: false,
  turnStartedAt: null,
  replyMs: null,
  ttsDown: false,
  unauthorized: false,
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`

/**
 * @param now Milliseconds from a monotonic clock, or `null` when replaying
 *   stored events — history carries no wall-clock ordering relative to the
 *   live socket, so timing every replayed turn as if it just happened would
 *   invent numbers. Replayed turns simply show no timings.
 */
export function reduceTranscript(
  state: TranscriptState,
  event: TranscriptEvent,
  now: number | null = performance.now(),
): TranscriptState {
  const append = (row: Omit<TranscriptRow, 'id'>, rest?: Partial<TranscriptState>): TranscriptState => ({
    ...state,
    rows: [...state.rows, { id: state.rows.length, ...row }],
    ...rest,
  })

  switch (event.type) {
    case 'reset':
      return emptyTranscript

    case 'partial_transcript':
      // An empty partial is a VAD open that has produced nothing yet — keep
      // whatever is already showing rather than blanking the bubble.
      return event.text ? { ...state, interim: event.text } : state

    case 'transcript': {
      // ~39% of VAD opens contain no speech and arrive with text: "". They are
      // normal, not errors, and must not become empty caller bubbles.
      if (!event.text) return { ...state, interim: null }
      const meta = [
        event.durationMs ? `${event.durationMs} ms audio` : '',
        event.endpointReason,
      ]
        .filter(Boolean)
        .join(' · ')
      return append(
        { kind: 'caller', text: event.text, meta: meta || undefined },
        { interim: null, awaitingReply: true, turnStartedAt: now, replyMs: null },
      )
    }

    case 'local_user_text':
      return append(
        { kind: 'caller', text: event.text },
        { interim: null, awaitingReply: true, turnStartedAt: now, replyMs: null },
      )

    case 'agent_speaking_start':
      // Deliberately does NOT open a bubble. A turn can produce no speakable
      // output at all, and an empty bubble that never fills reads as a bug.
      return { ...state, speaking: true, agentRowId: null }

    case 'agent_clause': {
      const replyMs =
        state.replyMs ?? (now !== null && state.turnStartedAt !== null ? now - state.turnStartedAt : null)
      if (state.agentRowId === null) {
        const next = append({ kind: 'agent', text: event.text })
        return { ...next, agentRowId: next.rows.length - 1, replyMs, awaitingReply: false }
      }
      return {
        ...state,
        rows: state.rows.map((r) =>
          r.id === state.agentRowId ? { ...r, text: r.text ? `${r.text} ${event.text}` : event.text } : r,
        ),
        replyMs,
        awaitingReply: false,
      }
    }

    case 'agent_speaking_end':
    case 'agent_interrupted': {
      const cut = event.type === 'agent_interrupted'
      const turnMs = now !== null && state.turnStartedAt !== null ? now - state.turnStartedAt : null
      const meta =
        state.replyMs !== null && turnMs !== null
          ? `first clause ${seconds(state.replyMs)} · turn ${seconds(turnMs)}`
          : undefined
      const rows = state.rows.map((r) =>
        r.id === state.agentRowId ? { ...r, meta: meta ?? r.meta, truncated: cut || r.truncated } : r,
      )
      const next: TranscriptState = {
        ...state,
        rows,
        agentRowId: null,
        speaking: false,
        awaitingReply: false,
        turnStartedAt: null,
      }
      return cut
        ? { ...next, rows: [...rows, { id: rows.length, kind: 'system', text: 'Agent was interrupted.' }] }
        : next
    }

    // Anchored right after the turn they refer to — the events arrive after
    // the clauses, so appending puts them next to the bubble they indict.
    case 'grounding_warning':
      return append({
        kind: 'ungrounded',
        text: `The agent stated identifier(s) no lookup returned: ${event.identifiers.join(', ')} — this is a fabrication, not a lookup.`,
      })

    case 'action_claim_warning':
      return append({
        kind: 'notdone',
        text: `The agent claimed this was done: ${event.claims.join(', ')} — but no tool call did it. Nothing actually happened.`,
      })

    case 'echo_discarded':
      return append({ kind: 'system', text: 'Discarded the agent hearing its own voice.' })

    case 'agent_audio_error':
      return append({ kind: 'system', text: 'Voice unavailable for one clause; its text is complete.' })

    case 'agent_error':
      // The TTS-down error repeats every turn by design — latch it into the
      // banner instead of adding an identical bubble to every reply.
      if (event.message.startsWith(TTS_UNAVAILABLE_PREFIX)) {
        return { ...state, ttsDown: true, awaitingReply: false }
      }
      return append({ kind: 'error', text: event.message }, { awaitingReply: false, speaking: false })

    case 'asr_error':
    case 'pipeline_error':
    case 'protocol_error':
      return append({ kind: 'error', text: event.message }, { awaitingReply: false })

    case 'closed': {
      const unauthorized = event.code === WS_CLOSE_UNAUTHORIZED
      const base: Partial<TranscriptState> = {
        speaking: false,
        awaitingReply: false,
        interim: null,
        agentRowId: null,
        unauthorized,
      }
      if (!event.message) return { ...state, ...base }
      return append({ kind: unauthorized ? 'error' : 'system', text: event.message }, base)
    }

    default:
      // ready, pipeline_configured, vad_start/end, asr_start and the binary
      // audio chunks drive the socket and the player, not the transcript.
      return state
  }
}

/** Two-argument form for `useReducer`, which only ever passes an action —
 * so the live clock falls through to its `performance.now()` default. */
export const liveTranscriptReducer = (state: TranscriptState, event: TranscriptEvent): TranscriptState =>
  reduceTranscript(state, event)

/** Replays a stored call's raw event array (from `GET /api/calls/{id}`)
 * through the exact reducer the live socket uses. */
export function replayTranscript(
  events: unknown[],
  normalize: (raw: unknown) => ServerEvent | null,
): TranscriptState {
  return events.reduce<TranscriptState>((state, raw) => {
    const event = normalize(raw)
    return event ? reduceTranscript(state, event, null) : state
  }, emptyTranscript)
}
