import { CompactCallRow } from './CompactCallRow'
import type { LiveCall } from '../types'

const VISIBLE_LIMIT = 3

/** The narrow "what's happening right now" companion to the resized Calls
 * Answered card — shows just enough live calls to glance at, with the rest
 * collapsed behind a "+N more" that drills into the full Call Log. */
export function CompactLiveCallsPanel({
  calls,
  onOpenCall,
  onViewAll,
}: {
  calls: LiveCall[]
  onOpenCall: (call: LiveCall) => void
  onViewAll: () => void
}) {
  const visible = calls.slice(0, VISIBLE_LIMIT)
  const remaining = calls.length - visible.length

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="mb-2 flex items-center gap-2">
        <h2 className="text-sm font-semibold text-body">Live calls</h2>
        {calls.length > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-pulse/10 px-1.5 py-0.5 text-[11px] font-semibold text-pulse">
            <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
            </span>
            {calls.length} in progress
          </span>
        )}
      </div>

      {calls.length === 0 ? (
        <div className="card flex items-center justify-center px-4 py-6 text-sm text-muted">
          No calls in progress
        </div>
      ) : (
        <ul className="card flex flex-col divide-y divide-hairline py-1">
          {visible.map((call) => (
            <CompactCallRow key={call.id} call={call} onOpen={onOpenCall} />
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 self-start text-xs font-medium text-faint hover:text-pulse"
        >
          +{remaining} more
        </button>
      )}
    </div>
  )
}
