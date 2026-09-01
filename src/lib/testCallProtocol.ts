/**
 * The message contract for a manual test call over the backend's real
 * `/ws/audio` endpoint (see backend/main.py — that file is the
 * source of truth, not a separate spec doc). Kept as a small discriminated
 * union on both sides so a new backend capability is additive here, not a
 * rewrite of the panel's state machine.
 *
 * Two things make this contract unusual compared to a typical JSON-only WS:
 * - Mic audio going up and TTS audio coming down are both raw binary WS
 *   frames (signed 16-bit PCM), never base64-wrapped JSON.
 * - `ready` reports capabilities as flat booleans (`asr_ready`,
 *   `conversation_ready`, `tts_ready`), not a nested `capabilities` object —
 *   normalized into one here so the rest of the app can treat it uniformly.
 */

export interface BackendCapabilities {
  asr: boolean
  llm: boolean
  tts: boolean
}

/** Languages the backend's ASR can be configured for. Fixed for the life of a
 * connection (set in `call_started`) — switching means a new socket. */
export const CALL_LANGUAGES = [
  { code: 'ta', label: 'Tamil' },
  { code: 'hi', label: 'Hindi' },
  { code: 'te', label: 'Telugu' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'kn', label: 'Kannada' },
  { code: 'bn', label: 'Bengali' },
  { code: 'mr', label: 'Marathi' },
  { code: 'gu', label: 'Gujarati' },
  { code: 'pa', label: 'Punjabi' },
] as const

/** The backend sends this exact string as an `agent_error` **once per turn**
 * while TTS is down. It is a wire constant, not prose — matching on it is the
 * only way to collapse the repeat into a single banner instead of one error
 * bubble per reply. Prefix-matched so a reworded tail still collapses. */
export const TTS_UNAVAILABLE_PREFIX = 'TTS is unavailable'

/** WebSocket close code the backend uses for a rejected `?token=`. Sent
 * *before* `accept()`, so a 4401 call never sees a `ready` event. */
export const WS_CLOSE_UNAUTHORIZED = 4401

/** What the panel sends over the socket as JSON text frames. Raw mic audio
 * is sent separately as binary frames — see `useTestCallSocket.sendAudioChunk`. */
export type ClientEvent =
  | {
      type: 'call_started'
      audio_format: 'pcm_s16le'
      sample_rate: number
      channels: 1
      language: string
    }
  | { type: 'user_text'; text: string }
  | { type: 'call_ended' }

/** What the panel receives as JSON text frames, normalized from the
 * backend's actual event names (see `normalizeServerEvent`). Binary frames
 * (TTS audio) are handled separately in `useTestCallSocket` and surfaced as
 * a synthetic `agent_audio_chunk` event alongside these; socket teardown
 * arrives as the synthetic `closed` event so one reducer sees everything. */
export type ServerEvent =
  | { type: 'ready'; capabilities: BackendCapabilities; connectionId: string }
  | { type: 'pipeline_configured'; language: string }
  | { type: 'vad_start' }
  | { type: 'vad_end'; reason: string }
  | { type: 'partial_transcript'; text: string }
  | { type: 'asr_start'; durationMs: number }
  | { type: 'transcript'; text: string; language: string; durationMs: number; endpointReason: string }
  | { type: 'echo_discarded'; text: string }
  | { type: 'agent_speaking_start'; sampleRate: number | null }
  | { type: 'agent_clause'; text: string }
  | { type: 'agent_interrupted' }
  | { type: 'agent_speaking_end' }
  | { type: 'agent_audio_chunk'; audio: ArrayBuffer }
  | { type: 'agent_audio_error'; message: string }
  | { type: 'grounding_warning'; identifiers: string[] }
  | { type: 'action_claim_warning'; claims: string[] }
  | { type: 'agent_error'; message: string }
  | { type: 'asr_error'; message: string }
  | { type: 'pipeline_error'; message: string }
  | { type: 'protocol_error'; message: string }
  | { type: 'closed'; code: number; message: string }

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/** The safety warnings carry arrays of strings. A malformed one must not take
 * the socket handler down — an empty list still renders the warning, which is
 * the safer failure direction for an event that means "the agent lied". */
function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map((v) => String(v)) : []
}

/** Normalizes one JSON text frame from `/ws/audio` into a `ServerEvent`.
 * Unknown types return null rather than throwing, so a future backend
 * addition degrades gracefully instead of crashing the socket handler.
 *
 * Not handled on purpose: `agent_tool_call` and `call_control` are never
 * emitted — the tool layer was removed from the backend — so there is no UI
 * to build for them. */
export function normalizeServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null
  const data = raw as Record<string, unknown>
  const type = data.type

  switch (type) {
    case 'ready':
      return {
        type: 'ready',
        capabilities: {
          asr: Boolean(data.asr_ready),
          llm: Boolean(data.conversation_ready),
          tts: Boolean(data.tts_ready),
        },
        connectionId: String(data.connection_id ?? ''),
      }
    case 'pipeline_configured':
      return { type: 'pipeline_configured', language: String(data.language ?? '') }
    case 'vad_start':
      return { type: 'vad_start' }
    case 'vad_end':
      return { type: 'vad_end', reason: String(data.reason ?? '') }
    case 'partial_transcript':
      return { type: 'partial_transcript', text: String(data.text ?? '') }
    case 'asr_start':
      return { type: 'asr_start', durationMs: num(data.duration_ms) }
    case 'transcript':
      return {
        type: 'transcript',
        text: String(data.text ?? ''),
        language: String(data.language ?? ''),
        durationMs: num(data.duration_ms),
        endpointReason: String(data.endpoint_reason ?? ''),
      }
    case 'echo_discarded':
      return { type: 'echo_discarded', text: String(data.text ?? '') }
    case 'agent_speaking_start':
      return {
        type: 'agent_speaking_start',
        sampleRate: typeof data.sample_rate === 'number' ? data.sample_rate : null,
      }
    case 'agent_clause':
      return { type: 'agent_clause', text: String(data.text ?? '') }
    case 'agent_interrupted':
      return { type: 'agent_interrupted' }
    case 'agent_speaking_end':
      return { type: 'agent_speaking_end' }
    case 'grounding_warning':
      return { type: 'grounding_warning', identifiers: strings(data.identifiers) }
    case 'action_claim_warning':
      return { type: 'action_claim_warning', claims: strings(data.claims) }
    case 'agent_audio_error':
      return { type: 'agent_audio_error', message: String(data.message ?? 'Audio unavailable for one clause.') }
    case 'agent_error':
      return { type: 'agent_error', message: String(data.message ?? 'Unknown agent error') }
    case 'asr_error':
    case 'protocol_error':
      return { type, message: String(data.message ?? 'Unknown error') }
    // `pipeline_error` carries the stage that failed and is followed by a
    // 1011 close — fold the stage into the message so it survives to the UI.
    case 'pipeline_error':
      return {
        type: 'pipeline_error',
        message: data.stage
          ? `${String(data.stage)}: ${String(data.message ?? 'failed to initialise')}`
          : String(data.message ?? 'Unknown error'),
      }
    default:
      return null
  }
}
