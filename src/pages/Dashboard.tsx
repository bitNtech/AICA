import { PulseLine } from '../components/PulseLine'
import { StatCard } from '../components/StatCard'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
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
        <h2 className="mb-3 text-sm font-semibold text-muted">
          Live activity
        </h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {mockLiveCalls.map((call) => (
            <LiveCallCard key={call.id} call={call} onOpen={openCallDetail} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-muted">
          Needs your attention
          {mockAttentionItems.length > 0 && (
            <span className="rounded-full bg-amber/15 px-1.5 py-0.5 text-[11px] font-semibold text-amber">
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
      className="flex w-56 shrink-0 flex-col gap-2 rounded-2xl border border-hairline bg-surface p-4 text-left transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
    >
      <p className="truncate text-sm font-medium text-body">{call.intent}</p>
      <PulseLine
        mode="live"
        height={28}
        className="text-pulse"
        aria-label={`Live waveform for ${call.intent}`}
      />
      <div className="flex items-center justify-between">
        <ConfidenceBadge level={call.confidence} score={call.confidenceScore} />
        <span className="font-mono text-xs text-muted">
          {formatDuration(elapsed)}
        </span>
      </div>
    </button>
  )
}
