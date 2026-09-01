import { useCallback, useEffect, useState } from 'react'
import { BackendApiError, fetchCallEvents, fetchCalls, type CallSummary } from '../lib/backendApi'
import { normalizeServerEvent } from '../lib/testCallProtocol'
import { replayTranscript, type TranscriptState } from '../lib/transcriptReducer'
import { AlertTriangleIcon, CallLogIcon } from './icons'

interface TestCallHistoryProps {
  /** Bumped whenever a call ends, to pull the just-finished call into the list. */
  refreshKey: number
  /** Id of the call currently being replayed, so the row can show as selected. */
  selectedId: string | null
  onReplay: (id: string, transcript: TranscriptState) => void
}

const time = (unixSeconds: number) =>
  unixSeconds ? new Date(unixSeconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'

/** Recent calls from `GET /api/calls`, each replayable through the same
 * reducer the live socket uses. This is what makes a dropped connection
 * survivable: the transcript is not lost with the socket.
 *
 * It is also the one part of the panel that needs the backend's REST API
 * rather than the socket, so it is where a missing CORS configuration shows
 * up. It fails to an inline note and never blocks the call itself. */
export function TestCallHistory({ refreshKey, selectedId, onReplay }: TestCallHistoryProps) {
  const [calls, setCalls] = useState<CallSummary[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingId, setLoadingId] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetchCalls(25, controller.signal)
      .then((rows) => {
        setCalls(rows)
        setError(null)
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return
        setError(cause instanceof BackendApiError ? cause.message : 'Could not load recent calls.')
      })
    return () => controller.abort()
  }, [refreshKey])

  const replay = useCallback(
    async (id: string) => {
      setLoadingId(id)
      try {
        const events = await fetchCallEvents(id)
        onReplay(id, replayTranscript(events, normalizeServerEvent))
      } catch (cause) {
        setError(cause instanceof BackendApiError ? cause.message : 'Could not load that call.')
      } finally {
        setLoadingId(null)
      }
    },
    [onReplay],
  )

  return (
    <section className="card flex min-h-0 flex-col overflow-hidden" aria-labelledby="test-call-history">
      <div className="flex items-center gap-2 border-b border-hairline px-4 py-2.5">
        <CallLogIcon className="h-3.5 w-3.5 text-muted" />
        <h3 id="test-call-history" className="text-xs font-semibold text-body">
          Recent calls
        </h3>
        <span className="ml-auto font-mono text-[10.5px] text-faint">{calls.length}</span>
      </div>

      {error ? (
        <p className="flex items-start gap-1.5 px-4 py-3 text-[11px] leading-relaxed text-muted">
          <AlertTriangleIcon className="mt-0.5 h-3 w-3 shrink-0 text-amber" />
          {error}
        </p>
      ) : calls.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-faint">
          Finished calls appear here and can be replayed.
        </p>
      ) : (
        <ul className="min-h-0 flex-1 divide-y divide-hairline overflow-y-auto">
          {calls.map((call) => {
            const live = call.endedAt === null
            return (
              <li key={call.connectionId}>
                <button
                  type="button"
                  onClick={() => void replay(call.connectionId)}
                  aria-current={selectedId === call.connectionId}
                  className={`flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-surface-hover ${
                    selectedId === call.connectionId ? 'bg-pulse/10' : ''
                  }`}
                >
                  <span className="font-mono text-[11px] text-body">{call.connectionId.slice(0, 8)}</span>
                  <span className="font-mono text-[10.5px] text-faint">{time(call.startedAt)}</span>
                  <span className="ml-auto font-mono text-[10.5px] tabular-nums text-muted">
                    {loadingId === call.connectionId
                      ? 'loading…'
                      : live
                        ? 'live'
                        : `${call.callerTurns}t · ${Math.round(call.durationSeconds ?? 0)}s`}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
