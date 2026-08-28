import { useState } from 'react'
import type { LiveCall } from '../types'
import { PulseLine } from './PulseLine'
import { CitationChip } from './CitationChip'
import { CitationSourceCard } from './CitationSourceCard'
import { ConfidenceBadge } from './ConfidenceBadge'
import { ChevronsLeftIcon } from './icons'

/** Demonstrates the explainability pillar: a live transcript with an
 * inline citation that swaps the same drawer over to the source document,
 * rather than opening a second layer of navigation. */
export function CallDetailPanel({ call }: { call: LiveCall }) {
  const [showSource, setShowSource] = useState(false)
  const isRedirect = call.confidence === 'low'

  if (showSource) {
    return (
      <div className="flex flex-col gap-4">
        <button
          type="button"
          onClick={() => setShowSource(false)}
          className="flex items-center gap-1.5 text-sm font-medium text-pulse hover:underline"
        >
          <ChevronsLeftIcon className="h-3.5 w-3.5" />
          Back to transcript
        </button>
        <CitationSourceCard />
        <p className="text-xs text-muted">
          AICA cited this passage when deciding how to handle the request.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PulseLine
        mode="live"
        height={48}
        className="text-pulse"
        aria-label="Live call waveform"
      />
      <div>
        <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
      </div>
      <div className="flex flex-col gap-3 font-mono text-sm">
        <p className="text-body">
          <span className="text-muted">AICA · 00:03</span> — Thanks for
          calling, how can I help today?
        </p>
        <p className="text-muted">
          <span className="text-muted">Caller · 00:07</span> — {call.intent}.
        </p>
        {isRedirect ? (
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
      <p className="text-xs text-muted">
        This is placeholder transcript data — the real feed connects over the
        live call websocket.
      </p>
    </div>
  )
}
