import { ConfidenceBadge } from './ConfidenceBadge'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import type { LiveCall } from '../types'

/** One-line live-call summary for the dashboard — the detailed view (waveform,
 * AI state, transcript) belongs to the Live Calls page; this just answers
 * "what's happening right now" at a glance. */
export function CompactCallRow({
  call,
  onOpen,
}: {
  call: LiveCall
  onOpen: (call: LiveCall) => void
}) {
  const elapsed = useElapsedSeconds(call.startedAt)

  return (
    <li>
      <button
        type="button"
        onClick={() => onOpen(call)}
        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 hover:bg-surface-hover"
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-pulse" />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium text-body">
          {call.intent}
        </span>
        <span className="shrink-0 font-mono text-xs text-muted">
          {formatDuration(elapsed)}
        </span>
        <span className="hidden shrink-0 sm:block">
          <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
        </span>
      </button>
    </li>
  )
}
