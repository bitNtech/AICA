import { PulseLine } from '../components/PulseLine'
import { StatCard } from '../components/StatCard'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { AiStateIndicator } from '../components/AiStateIndicator'
import { AttentionList } from '../components/AttentionList'
import { CallDetailPanel } from '../components/CallDetailPanel'
import { mockStats, mockLiveCalls, mockAttentionItems } from '../data/mock'
import { useElapsedSeconds } from '../lib/useElapsedSeconds'
import { formatDuration } from '../lib/format'
import { useUiStore } from '../store/ui'
import type { LiveCall } from '../types'

export function Dashboard() {
  const openDrawer = useUiStore((s) => s.openDrawer)

  function openCallDetail(call: LiveCall) {
    openDrawer({
      title: call.intent,
      subtitle: `${call.callerLabel} · live now`,
      body: <CallDetailPanel call={call} />,
    })
  }

  const worstSeverity = mockAttentionItems.some((i) => i.severity === 'critical')
    ? 'critical'
    : mockAttentionItems.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'info'
  const badgeClass =
    worstSeverity === 'critical'
      ? 'bg-critical/15 text-critical'
      : worstSeverity === 'warning'
        ? 'bg-amber/15 text-amber'
        : 'bg-info/15 text-info'

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mockStats.map((stat) => (
            <StatCard key={stat.id} stat={stat} />
          ))}
        </div>
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-body">Live activity</h2>
          <span className="flex items-center gap-1.5 text-xs font-medium text-pulse">
            <span className="relative flex h-1.5 w-1.5">
              {mockLiveCalls.length > 0 && (
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
            </span>
            {mockLiveCalls.length} in progress
          </span>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {mockLiveCalls.map((call) => (
            <LiveCallCard key={call.id} call={call} onOpen={openCallDetail} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-body">
          Needs your attention
          {mockAttentionItems.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
              {mockAttentionItems.length}
            </span>
          )}
        </h2>
        <AttentionList items={mockAttentionItems} />
      </section>
    </div>
  )
}

function LiveCallCard({
  call,
  onOpen,
}: {
  call: LiveCall
  onOpen: (call: LiveCall) => void
}) {
  const elapsed = useElapsedSeconds(call.startedAt)

  return (
    <button
      type="button"
      onClick={() => onOpen(call)}
      className="card-interactive flex w-60 shrink-0 flex-col gap-2.5 p-4 text-left"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-pulse">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
          </span>
          Live
        </span>
        <span className="font-mono text-xs text-muted">{formatDuration(elapsed)}</span>
      </div>
      <p className="truncate text-sm font-medium text-body">{call.intent}</p>
      <PulseLine
        mode="live"
        height={28}
        className="text-pulse"
        aria-label={`Live waveform for ${call.intent}`}
      />
      <div className="flex items-center justify-between gap-2">
        <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
      </div>
      <AiStateIndicator confidence={call.confidence} />
    </button>
  )
}
