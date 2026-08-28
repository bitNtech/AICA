import { useState } from 'react'
import { mockLiveCalls } from '../data/mock'
import { PulseLine } from '../components/PulseLine'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { AiStateIndicator } from '../components/AiStateIndicator'
import { CitationChip } from '../components/CitationChip'
import { CitationSourceCard } from '../components/CitationSourceCard'
import { EmptyState } from '../components/EmptyState'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import { useUiStore } from '../store/ui'
import type { LiveCall } from '../types'
import { LiveCallsIcon } from '../components/icons'

export function LiveCallsPage() {
  const [selectedId, setSelectedId] = useState(mockLiveCalls[0]?.id)
  const selected = mockLiveCalls.find((c) => c.id === selectedId)

  if (mockLiveCalls.length === 0) {
    return (
      <EmptyState
        title="No calls in progress"
        description="When a caller reaches AICA, the live transcript and waveform show up here in real time."
      />
    )
  }

  return (
    <div className="flex gap-6">
      <ul className="flex w-72 shrink-0 flex-col gap-2">
        {mockLiveCalls.map((call) => (
          <CallListRow
            key={call.id}
            call={call}
            active={call.id === selectedId}
            onSelect={() => setSelectedId(call.id)}
          />
        ))}
      </ul>
      <div className="min-w-0 flex-1">
        {selected ? (
          <LiveCallDetail key={selected.id} call={selected} />
        ) : (
          <EmptyState
            title="Select a call"
            description="Pick a call from the list to see its live transcript."
          />
        )}
      </div>
    </div>
  )
}

function CallListRow({
  call,
  active,
  onSelect,
}: {
  call: LiveCall
  active: boolean
  onSelect: () => void
}) {
  const elapsed = useElapsedSeconds(call.startedAt)
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className={`flex w-full flex-col gap-1.5 rounded-2xl border p-3.5 text-left shadow-sm transition-colors duration-150 ${
          active
            ? 'border-pulse/30 bg-pulse/10'
            : 'border-hairline bg-surface hover:bg-surface-hover'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-pulse">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
            </span>
            Live
          </span>
          <span className="shrink-0 font-mono text-xs text-muted">
            {formatDuration(elapsed)}
          </span>
        </div>
        <p className="truncate text-sm font-medium text-body">{call.intent}</p>
        <p className="text-xs text-muted">{call.callerLabel}</p>
        <div className="flex items-center justify-between gap-2">
          <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
          <AiStateIndicator confidence={call.confidence} />
        </div>
      </button>
    </li>
  )
}

function LiveCallDetail({ call }: { call: LiveCall }) {
  const [takenOver, setTakenOver] = useState(false)
  const elapsed = useElapsedSeconds(call.startedAt)
  const openDrawer = useUiStore((s) => s.openDrawer)
  const isRedirect = call.confidence === 'low'

  function showSource() {
    openDrawer({
      title: 'Rescheduling policy',
      subtitle: 'Cited by AICA during this call',
      body: <CitationSourceCard />,
    })
  }

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-normal text-body">
            {call.intent}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {call.callerLabel} · live for {formatDuration(elapsed)}
          </p>
        </div>
        {takenOver ? (
          <div className="flex items-center gap-3 rounded-full bg-sage/12 py-1.5 pl-3 pr-1.5">
            <span className="text-sm font-medium text-sage">
              You're on the line
            </span>
            <button
              type="button"
              onClick={() => setTakenOver(false)}
              className="rounded-full bg-sage px-3 py-1 text-xs font-semibold text-ink-teal"
            >
              Hand back to AICA
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTakenOver(true)}
            aria-label="Take over this call — barge in and speak directly to the caller"
            className="btn-primary !bg-critical !text-white !px-4 !py-2.5 hover:!bg-critical/90"
          >
            <LiveCallsIcon className="h-4 w-4" />
            Take over this call
          </button>
        )}
      </div>

      <div className="mt-6 flex items-center justify-between gap-3">
        <PulseLine
          mode="live"
          height={56}
          className="flex-1 text-pulse"
          aria-label="Live call waveform"
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
        <span className="text-faint">·</span>
        <AiStateIndicator confidence={call.confidence} />
        {takenOver && (
          <span className="text-xs font-medium text-muted">
            AICA has stepped back while you're connected.
          </span>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 border-t border-hairline pt-6 font-mono text-sm">
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
        ) : takenOver ? (
          <p className="text-sage">
            <span className="text-muted">You · just now</span> — I've got it
            from here, thanks AICA.
          </p>
        ) : (
          <p className="text-body">
            <span className="text-muted">AICA · 00:12</span> — I can take
            care of that for you right now.
            <CitationChip label="Rescheduling policy" onOpen={showSource} />
          </p>
        )}
      </div>
    </div>
  )
}
