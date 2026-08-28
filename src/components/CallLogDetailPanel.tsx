import { useState } from 'react'
import type { CallLogEntry } from '../types'
import { PulseLine } from './PulseLine'
import { ConfidenceBadge } from './ConfidenceBadge'
import { CitationChip } from './CitationChip'
import { CitationSourceCard } from './CitationSourceCard'
import { formatDuration } from '../lib/format'
import { useUiStore } from '../store/ui'

/** Historical call detail — a completed call, so the Pulse Line settles
 * into its end mode rather than the live scroll. Outcome tag is editable:
 * this is how staff correct the resolver's guess when CRM data is thin. */
export function CallLogDetailPanel({ entry }: { entry: CallLogEntry }) {
  const [showSource, setShowSource] = useState(false)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

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
          defaultValue={entry.outcome}
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

      <div className="flex gap-2 border-t border-hairline pt-5">
        <button type="button" onClick={closeDrawer} className="btn-secondary">
          Flag for review
        </button>
      </div>
    </div>
  )
}
