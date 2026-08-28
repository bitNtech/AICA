import type { SimulationCall } from '../types'
import { SimResultBadge } from './SimResultBadge'

/** Agent-response vs. human-response, side by side — the individual call
 * behind a "beat / matched / worse" verdict. */
export function SimulationCallCompare({ call }: { call: SimulationCall }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <SimResultBadge result={call.result} />
        {call.ghost && (
          <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
            Ghost run
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-hairline bg-surface-warm p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            AICA's response
          </p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            {call.agentResponse}
          </p>
        </div>
        <div className="rounded-2xl border border-hairline bg-canvas p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Human front-desk response
          </p>
          <p className="mt-2 text-sm leading-relaxed text-body">
            {call.humanResponse}
          </p>
        </div>
      </div>
    </div>
  )
}
