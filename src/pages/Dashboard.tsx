import type { ReactNode } from 'react'
import { StatCard } from '../components/StatCard'
import { DonutChartCard, type DonutSegment } from '../components/DonutChartCard'
import { CallDetailPanel } from '../components/CallDetailPanel'
import { CompactLiveCallsPanel } from '../components/CompactLiveCallsPanel'
import { AgentShutdownControl } from '../components/AgentShutdownControl'
import { CheckIcon, DataReadinessIcon } from '../components/icons'
import { mockStats, mockLiveCalls, mockCallLog, mockSimulationRun } from '../data/mock'
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

  function openCallDetail(call: LiveCall) {
    openDrawer({
      title: call.intent,
      subtitle: `${call.callerLabel} · live now`,
      body: <CallDetailPanel call={call} />,
    })
  }

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
  const DONUT_ICON: Record<string, ReactNode> = {
    'resolved-no-redirect': <CheckIcon className="h-4 w-4" />,
    'matched-human': <DataReadinessIcon className="h-4 w-4" />,
  }
  const STAT_TARGET: Record<string, () => void> = {
    'calls-answered': () => onNavigate('call-log'),
    'resolved-no-redirect': () => onNavigate('call-log', { outcome: 'resolved' }),
    'matched-human': () => onNavigate('simulation'),
  }

  const countStat = mockStats.find((s) => s.format === 'count')
  const percentStats = mockStats.filter((s) => s.format === 'percent')

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {countStat && (
          <div className="w-full shrink-0 sm:w-96">
            <StatCard stat={countStat} onOpen={STAT_TARGET[countStat.id]} />
          </div>
        )}
        <CompactLiveCallsPanel
          calls={mockLiveCalls}
          onOpenCall={openCallDetail}
          onViewAll={() => onNavigate('call-log')}
        />
      </div>

      {topIntent && (
        <button
          type="button"
          onClick={() => onNavigate('call-log', { search: topIntent })}
          className="self-start text-left text-xs text-faint hover:text-muted"
        >
          <span className="font-semibold uppercase tracking-wider text-insight">AI insight</span>
          {'  ·  '}Most common request this week: {topIntent}
        </button>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {percentStats.map((stat) => (
          <DonutChartCard
            key={stat.id}
            title={stat.label}
            icon={DONUT_ICON[stat.id]}
            segments={BREAKDOWNS[stat.id] ?? []}
            centerLabel={stat.value}
            value={stat.numericValue}
            target={stat.target}
            delta={stat.delta}
            trend={stat.trend}
            onOpen={STAT_TARGET[stat.id]}
          />
        ))}
      </div>

      <AgentShutdownControl />
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
