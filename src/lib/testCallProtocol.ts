/**
 * The message contract for a manual test call over `/ws/audio`, per the
 * backend's documented event set (see BACKEND_COMPLETION.md in the backend
 * repo). Kept as a small discriminated union on both sides so a new backend
 * capability (e.g. TTS landing) is additive here, not a rewrite of the
 * panel's state machine.
 */

export interface BackendCapabilities {
  asr: boolean
  llm: boolean
  tts: boolean
}

/** What the panel sends over the socket. */
export type ClientEvent =
  | {
      type: 'call_started'
      audio_format: 'pcm_s16le'
      sample_rate: number
      channels: 1
      language: string
    }
  | { type: 'user_text'; text: string }
  | { type: 'user_audio_chunk'; audio: string }
  | { type: 'call_ended' }

/** What the panel receives, normalized from whatever shape the backend
 * sends (see `normalizeServerEvent`). */
export type ServerEvent =
  | { type: 'ready'; capabilities: BackendCapabilities; asrReady: boolean }
  | { type: 'user_transcript'; text: string; final: boolean }
  | { type: 'agent_text'; text: string }
  | { type: 'agent_audio_chunk'; audioBase64: string; format: string }
  | { type: 'vad_event'; speaking: boolean }
  | { type: 'asr_error'; message: string }
  | { type: 'pipeline_error'; message: string }
  | { type: 'protocol_error'; message: string }

/** The backend is being built in phases — today's `ready` event may not
 * even include `capabilities` yet. Treat missing fields as "not live" rather
 * than throwing, and accept both the documented `asr_ready` field name and a
 * capabilities-object form so this keeps working as the payload evolves. */
export function normalizeServerEvent(raw: unknown): ServerEvent | null {
  if (typeof raw !== 'object' || raw === null || !('type' in raw)) return null
  const data = raw as Record<string, unknown>
  const type = data.type

  switch (type) {
    case 'ready': {
      const caps = data.capabilities as Partial<BackendCapabilities> | undefined
      const asr = caps?.asr ?? Boolean(data.asr_ready)
      return {
        type: 'ready',
        capabilities: {
          asr,
          llm: caps?.llm ?? false,
          tts: caps?.tts ?? false,
        },
        asrReady: asr,
      }
    }
    case 'user_transcript':
      return { type: 'user_transcript', text: String(data.text ?? ''), final: Boolean(data.final) }
    case 'agent_text':
      return { type: 'agent_text', text: String(data.text ?? '') }
    case 'agent_audio_chunk':
      return {
        type: 'agent_audio_chunk',
        audioBase64: String(data.audio ?? ''),
        format: String(data.format ?? 'pcm_s16le'),
      }
    case 'vad_event':
      return { type: 'vad_event', speaking: Boolean(data.speaking) }
    case 'asr_error':
    case 'pipeline_error':
    case 'protocol_error':
      return { type, message: String(data.message ?? 'Unknown error') }
    default:
      return null
  }
}

export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}
