/** The backend's three read-only REST endpoints, which sit alongside the
 * `/ws/audio` socket in the same FastAPI process.
 *
 * These are the *only* cross-origin requests the app makes — a browser
 * applies CORS to `fetch` but not to WebSockets, so a test call can connect
 * and stream perfectly while every call here fails. That asymmetry is
 * confusing enough to be worth naming in the error message rather than
 * letting a bare "Failed to fetch" reach the UI.
 *
 * Everything here degrades to nothing: the socket's own `ready` event is
 * authoritative for capabilities, so a blocked `/api/health` costs the call
 * log and some pre-call detail, not the call.
 */

import { env } from './env'

export interface BackendHealth {
  asrReady: boolean
  conversationReady: boolean
  llmReady: boolean
  llmModel: string
  ttsReady: boolean
}

export interface CallSummary {
  connectionId: string
  startedAt: number
  /** Null while the call is still in progress — render it as live, not 0 s. */
  endedAt: number | null
  durationSeconds: number | null
  callerTurns: number
  agentClauses: number
}

/** Thrown for any REST failure, with copy that distinguishes the common
 * cross-origin case from a backend that is genuinely down. */
export class BackendApiError extends Error {}

function base(): string {
  const configured = env.backendHttpUrl
  if (configured === undefined) {
    throw new BackendApiError('No backend URL is configured (VITE_BACKEND_WS_URL).')
  }
  return configured
}

async function getJson(path: string, signal?: AbortSignal): Promise<Record<string, unknown>> {
  let response: Response
  try {
    response = await fetch(`${base()}${path}`, { signal })
  } catch (cause) {
    if (cause instanceof BackendApiError) throw cause
    if (signal?.aborted) throw cause
    // fetch() rejects identically for "server unreachable" and "server
    // answered but the browser dropped the response for lack of CORS
    // headers". The second is by far the likelier one here, because the
    // socket connecting proves the host is up.
    throw new BackendApiError(
      'Could not read the backend REST API. If test calls connect but this does not, the backend needs CORS_ORIGINS set for this origin (or serve both behind one proxy).',
    )
  }
  if (!response.ok) {
    throw new BackendApiError(`Backend returned ${response.status} for ${path}.`)
  }
  return (await response.json()) as Record<string, unknown>
}

const bool = (v: unknown) => Boolean(v)
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const maybeNum = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/** Which parts of the pipeline actually loaded. A 200 from the server is not
 * evidence the pipeline is whole — the four components load independently at
 * startup and any of them can fail without stopping the process. */
export async function fetchHealth(signal?: AbortSignal): Promise<BackendHealth> {
  const data = await getJson('/api/health', signal)
  return {
    asrReady: bool(data.asr_ready),
    conversationReady: bool(data.conversation_ready),
    llmReady: bool(data.llm_ready),
    llmModel: String(data.llm_model ?? ''),
    ttsReady: bool(data.tts_ready),
  }
}

/** Recent calls, newest first. The backend clamps `limit` to 1–500. */
export async function fetchCalls(limit = 25, signal?: AbortSignal): Promise<CallSummary[]> {
  const data = await getJson(`/api/calls?limit=${limit}`, signal)
  const calls = Array.isArray(data.calls) ? data.calls : []
  return calls.map((raw) => {
    const c = raw as Record<string, unknown>
    return {
      connectionId: String(c.connection_id ?? ''),
      startedAt: num(c.started_at),
      endedAt: maybeNum(c.ended_at),
      durationSeconds: maybeNum(c.duration_seconds),
      callerTurns: num(c.caller_turns),
      agentClauses: num(c.agent_clauses),
    }
  })
}

/** One call's raw event array, oldest first. These are byte-identical to what
 * went over the socket, which is why `replayTranscript` can render them with
 * the live reducer instead of a second code path. Best-effort history, not a
 * recording: rows can be missing if the events' encryption key was rotated. */
export async function fetchCallEvents(id: string, signal?: AbortSignal): Promise<unknown[]> {
  const data = await getJson(`/api/calls/${encodeURIComponent(id)}`, signal)
  return Array.isArray(data.events) ? data.events : []
}
