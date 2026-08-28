import { useState } from 'react'
import { StatCard } from '../components/StatCard'
import type { DonutSegment } from '../components/DonutBreakdown'
import { AttentionList } from '../components/AttentionList'
import { CallDetailPanel } from '../components/CallDetailPanel'
import { CompactCallRow } from '../components/CompactCallRow'
import {
  mockStats,
  mockLiveCalls,
  mockAttentionItems,
  mockCallLog,
  mockSimulationRun,
} from '../data/mock'
import { useUiStore } from '../store/ui'
import type { CallLogSeed, CallOutcome, LiveCall } from '../types'

const OUTCOME_LABEL: Record<CallOutcome, string> = {
  resolved: 'Resolved by AICA',
  redirected: 'Redirected',
  voicemail: 'Voicemail',
  no_answer_redirect: 'No answer — redirected',
}
const OUTCOME_COLOR: Record<CallOutcome, string> = {
  resolved: 'text-sage',
  redirected: 'text-amber',
  voicemail: 'text-signal',
  no_answer_redirect: 'text-critical',
}

export function Dashboard({
  onNavigate,
}: {
  onNavigate: (id: string, filter?: CallLogSeed) => void
}) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const [attentionItems, setAttentionItems] = useState(mockAttentionItems)

  function openCallDetail(call: LiveCall) {
    openDrawer({
      title: call.intent,
      subtitle: `${call.callerLabel} · live now`,
      body: <CallDetailPanel call={call} />,
    })
  }

  function dismissAttentionItem(id: string) {
    setAttentionItems((prev) => prev.filter((item) => item.id !== id))
  }

  const worstSeverity = attentionItems.some((i) => i.severity === 'critical')
    ? 'critical'
    : attentionItems.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'info'
  const badgeClass =
    worstSeverity === 'critical'
      ? 'bg-critical/15 text-critical'
      : worstSeverity === 'warning'
        ? 'bg-amber/15 text-amber'
        : 'bg-info/15 text-info'

  const topIntent = mostFrequentIntent([...mockCallLog, ...mockLiveCalls])

  // Real breakdowns behind the two percent KPIs — not a single hue-on-itself
  // ring, an actual distribution of the call-log/simulation records.
  const outcomeCounts = new Map<CallOutcome, number>()
  for (const entry of mockCallLog) {
    outcomeCounts.set(entry.outcome, (outcomeCounts.get(entry.outcome) ?? 0) + 1)
  }
  const resolvedBreakdown: DonutSegment[] = Array.from(outcomeCounts.entries()).map(
    ([outcome, value]) => ({
      label: OUTCOME_LABEL[outcome],
      value,
      colorClassName: OUTCOME_COLOR[outcome],
    }),
  )
  const matchedBreakdown: DonutSegment[] = [
    { label: 'Beat human', value: mockSimulationRun.beat, colorClassName: 'text-pulse' },
    { label: 'Matched human', value: mockSimulationRun.matched, colorClassName: 'text-sage' },
    { label: 'Worse than human', value: mockSimulationRun.worse, colorClassName: 'text-amber' },
  ]
  const BREAKDOWNS: Record<string, DonutSegment[]> = {
    'resolved-no-redirect': resolvedBreakdown,
    'matched-human': matchedBreakdown,
  }
  const STAT_TARGET: Record<string, () => void> = {
    'calls-answered': () => onNavigate('call-log'),
    'resolved-no-redirect': () => onNavigate('call-log', { outcome: 'resolved' }),
    'matched-human': () => onNavigate('simulation'),
  }

  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mockStats.map((stat) => (
            <StatCard
              key={stat.id}
              stat={stat}
              breakdown={BREAKDOWNS[stat.id]}
              onOpen={STAT_TARGET[stat.id]}
            />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-body">
          Needs your attention
          {attentionItems.length > 0 && (
            <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${badgeClass}`}>
              {attentionItems.length}
            </span>
          )}
        </h2>
        <AttentionList
          items={attentionItems}
          onNavigate={onNavigate}
          onDismiss={dismissAttentionItem}
        />
      </section>

      <section>
        <div className="mb-2 flex items-center gap-2">
          <h2 className="text-sm font-semibold text-body">Live calls</h2>
          {mockLiveCalls.length > 0 && (
            <span className="flex items-center gap-1.5 rounded-full bg-pulse/10 px-1.5 py-0.5 text-[11px] font-semibold text-pulse">
              <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
              </span>
              {mockLiveCalls.length} in progress
            </span>
          )}
        </div>
        <ul className="card flex flex-col divide-y divide-hairline py-1">
          {mockLiveCalls.map((call) => (
            <CompactCallRow key={call.id} call={call} onOpen={openCallDetail} />
          ))}
        </ul>
        {topIntent && (
          <button
            type="button"
            onClick={() => onNavigate('call-log', { search: topIntent })}
            className="mt-3 text-left text-xs text-faint hover:text-muted"
          >
            <span className="font-semibold uppercase tracking-wider text-insight">AI insight</span>
            {'  ·  '}Most common request this week: {topIntent}
          </button>
        )}
      </section>
    </div>
  )
}

function mostFrequentIntent(entries: { intent: string }[]): string | null {
  if (entries.length === 0) return null
  const counts = new Map<string, number>()
  for (const entry of entries) {
    counts.set(entry.intent, (counts.get(entry.intent) ?? 0) + 1)
  }
  let best: string | null = null
  let bestCount = 0
  for (const [intent, count] of counts) {
    if (count > bestCount) {
      best = intent
      bestCount = count
    }
  }
  return best
}
