import { useState } from 'react'
import type { CallLogEntry, CallOutcome } from '../types'
import { PulseLine } from './PulseLine'
import { ConfidenceBadge } from './ConfidenceBadge'
import { CitationChip } from './CitationChip'
import { CitationSourceCard } from './CitationSourceCard'
import { formatDuration } from '../lib/format'
import { AlertTriangleIcon } from './icons'

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  resolved: 'Resolved by AICA',
  redirected: 'Redirected to staff',
  voicemail: 'Voicemail taken',
  no_answer_redirect: 'Redirected — no answer',
}

/** Historical call detail — a completed call, so the Pulse Line settles
 * into its end mode rather than the live scroll. Outcome tag is editable:
 * this is how staff correct the resolver's guess when CRM data is thin. Both
 * edits persist back to the Call Log table via `onUpdate`, not just this
 * drawer. */
export function CallLogDetailPanel({
  entry,
  onUpdate,
}: {
  entry: CallLogEntry
  onUpdate: (patch: Partial<CallLogEntry>) => void
}) {
  const [showSource, setShowSource] = useState(false)
  // Local state, not the `entry` prop directly: the drawer's body is a
  // snapshot handed to the global drawer store once at open time, so it
  // won't re-render on its own when `onUpdate` changes the source row.
  const [outcome, setOutcome] = useState(entry.outcome)
  const [flagged, setFlagged] = useState(entry.flaggedForReview ?? false)

  function changeOutcome(next: CallOutcome) {
    setOutcome(next)
    onUpdate({ outcome: next, outcomeLabel: OUTCOME_LABEL[next] })
  }

  function toggleFlag() {
    const next = !flagged
    setFlagged(next)
    onUpdate({ flaggedForReview: next })
  }

  return (
    <div className="flex flex-col gap-5">
      <PulseLine
        mode="end"
        height={40}
        className="text-muted"
        aria-label="Call ended"
      />

      <div className="flex flex-wrap items-center gap-2">
        <ConfidenceBadge level={entry.confidence} score={entry.confidenceScore} />
        <span className="font-mono text-xs text-muted">
          {formatDuration(entry.durationSec)}
        </span>
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted">
          Outcome
        </label>
        <select
          value={outcome}
          onChange={(e) => changeOutcome(e.target.value as CallOutcome)}
          className="mt-1.5 w-full rounded-lg border border-hairline bg-canvas px-3 py-2 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
        >
          <option value="resolved">Resolved by AICA</option>
          <option value="redirected">Redirected to staff</option>
          <option value="voicemail">Voicemail taken</option>
          <option value="no_answer_redirect">Redirected — no answer</option>
        </select>
        <p className="mt-1.5 text-xs text-muted">
          Correct this if AICA's guess doesn't match what actually happened —
          it helps tune future calls like this one.
        </p>
      </div>

      {showSource ? (
        <div className="flex flex-col gap-3">
          <button
            type="button"
            onClick={() => setShowSource(false)}
            className="text-left text-sm font-medium text-pulse hover:underline"
          >
            ← Back to transcript
          </button>
          <CitationSourceCard />
        </div>
      ) : (
        <div className="flex flex-col gap-3 border-t border-hairline pt-5 font-mono text-sm">
          <p className="text-body">
            <span className="text-muted">AICA · 00:03</span> — Thanks for
            calling, how can I help today?
          </p>
          <p className="text-muted">
            <span className="text-muted">Caller · 00:07</span> — {entry.intent}.
          </p>
          {entry.redirected ? (
            <p className="text-body">
              <span className="text-muted">AICA · 00:12</span> — That needs a
              look from our front desk team, connecting you now.
            </p>
          ) : (
            <p className="text-body">
              <span className="text-muted">AICA · 00:12</span> — I can take
              care of that for you right now.
              <CitationChip label="Rescheduling policy" onOpen={() => setShowSource(true)} />
            </p>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 border-t border-hairline pt-5">
        <button
          type="button"
          onClick={toggleFlag}
          className={flagged ? 'btn-danger' : 'btn-secondary'}
        >
          <AlertTriangleIcon className="h-3.5 w-3.5" />
          {flagged ? 'Flagged for review' : 'Flag for review'}
        </button>
        {flagged && <span className="text-xs text-muted">Visible on the Call Log table</span>}
      </div>
    </div>
  )
}
