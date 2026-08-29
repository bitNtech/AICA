/**
 * The message contract for a manual test call over the backend's real
 * `/ws/audio` endpoint (see AICA-backend/backend/main.py — that file is the
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
 * a synthetic `agent_audio_chunk` event alongside these. */
export type ServerEvent =
  | { type: 'ready'; capabilities: BackendCapabilities; connectionId: string }
  | { type: 'pipeline_configured'; language: string }
  | { type: 'vad_start' }
  | { type: 'vad_end'; reason: string }
  | { type: 'partial_transcript'; text: string }
  | { type: 'transcript'; text: string; language: string }
  | { type: 'agent_speaking_start'; sampleRate: number | null }
  | { type: 'agent_clause'; text: string }
  | { type: 'agent_interrupted' }
  | { type: 'agent_speaking_end' }
  | { type: 'agent_audio_chunk'; audio: ArrayBuffer }
  | { type: 'agent_error'; message: string }
  | { type: 'asr_error'; message: string }
  | { type: 'pipeline_error'; message: string }
  | { type: 'protocol_error'; message: string }

/** Normalizes one JSON text frame from `/ws/audio` into a `ServerEvent`.
 * Unknown/irrelevant types (e.g. `asr_start`, which the panel doesn't need)
 * return null rather than throwing, so a future backend addition degrades
 * gracefully instead of crashing the socket handler. */
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
    case 'transcript':
      return { type: 'transcript', text: String(data.text ?? ''), language: String(data.language ?? '') }
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
    case 'agent_error':
      return { type: 'agent_error', message: String(data.message ?? 'Unknown agent error') }
    case 'asr_error':
    case 'pipeline_error':
    case 'protocol_error':
      return { type, message: String(data.message ?? 'Unknown error') }
    default:
      return null
  }
}
