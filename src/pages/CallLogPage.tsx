import { useMemo, useState } from 'react'
import { mockCallLog } from '../data/mock'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { CallLogDetailPanel } from '../components/CallLogDetailPanel'
import { EmptyState } from '../components/EmptyState'
import { CheckIcon, CloseIcon } from '../components/icons'
import { formatDuration, formatRelativeTime } from '../lib/format'
import { useUiStore } from '../store/ui'
import type { CallLogEntry, CallOutcome, ConfidenceLevel } from '../types'

const OUTCOME_STYLE: Record<CallOutcome, string> = {
  resolved: 'bg-sage/12 text-sage',
  redirected: 'bg-amber/15 text-amber',
  voicemail: 'bg-signal/12 text-signal',
  no_answer_redirect: 'bg-critical/12 text-critical',
}

type SortKey = 'timestamp' | 'durationSec'

export function CallLogPage({
  initialSearch = '',
  initialOutcomeFilter = 'all',
  initialConfidenceFilter = 'all',
}: {
  initialSearch?: string
  initialOutcomeFilter?: 'all' | CallOutcome
  initialConfidenceFilter?: 'all' | ConfidenceLevel
}) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const [search, setSearch] = useState(initialSearch)
  const [outcomeFilter, setOutcomeFilter] = useState<'all' | CallOutcome>(initialOutcomeFilter)
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | ConfidenceLevel>(
    initialConfidenceFilter,
  )
  const [sortKey, setSortKey] = useState<SortKey>('timestamp')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = mockCallLog.filter((entry) => {
      if (outcomeFilter !== 'all' && entry.outcome !== outcomeFilter) return false
      if (confidenceFilter !== 'all' && entry.confidence !== confidenceFilter) return false
      if (q && !`${entry.intent} ${entry.callerLabel}`.toLowerCase().includes(q))
        return false
      return true
    })
    const sorted = [...filtered].sort((a, b) => {
      const av = sortKey === 'timestamp' ? new Date(a.timestamp).getTime() : a.durationSec
      const bv = sortKey === 'timestamp' ? new Date(b.timestamp).getTime() : b.durationSec
      return sortDir === 'asc' ? av - bv : bv - av
    })
    return sorted
  }, [search, outcomeFilter, confidenceFilter, sortKey, sortDir])

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  function openDetail(entry: CallLogEntry) {
    openDrawer({
      title: entry.intent,
      subtitle: `${entry.callerLabel} · ${formatRelativeTime(entry.timestamp)}`,
      body: <CallLogDetailPanel entry={entry} />,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by caller or intent…"
          className="input w-64"
        />
        <FilterSelect
          value={outcomeFilter}
          onChange={(v) => setOutcomeFilter(v as typeof outcomeFilter)}
          options={[
            { value: 'all', label: 'All outcomes' },
            { value: 'resolved', label: 'Resolved by AICA' },
            { value: 'redirected', label: 'Redirected' },
            { value: 'voicemail', label: 'Voicemail' },
            { value: 'no_answer_redirect', label: 'Redirected — no answer' },
          ]}
        />
        <FilterSelect
          value={confidenceFilter}
          onChange={(v) => setConfidenceFilter(v as typeof confidenceFilter)}
          options={[
            { value: 'all', label: 'All confidence' },
            { value: 'high', label: 'High confidence' },
            { value: 'review', label: 'Needs review' },
            { value: 'low', label: 'Low confidence' },
          ]}
        />
        </div>
        <p className="font-mono text-xs text-faint">
          {rows.length} {rows.length === 1 ? 'call' : 'calls'}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No calls match these filters"
          description="Try widening your search or clearing a filter."
          actionLabel="Clear filters"
          onAction={() => {
            setSearch('')
            setOutcomeFilter('all')
            setConfidenceFilter('all')
          }}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated text-xs text-muted">
                <SortableHeader
                  label="Time"
                  active={sortKey === 'timestamp'}
                  dir={sortDir}
                  onClick={() => toggleSort('timestamp')}
                />
                <th className="px-4 py-3 font-medium">Caller</th>
                <th className="px-4 py-3 font-medium">Intent</th>
                <th className="px-4 py-3 font-medium">Outcome</th>
                <th className="px-4 py-3 font-medium">Confidence</th>
                <SortableHeader
                  label="Duration"
                  active={sortKey === 'durationSec'}
                  dir={sortDir}
                  onClick={() => toggleSort('durationSec')}
                />
                <th className="px-4 py-3 text-center font-medium">Redirected</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {rows.map((entry) => (
                <tr
                  key={entry.id}
                  onClick={() => openDetail(entry)}
                  className="cursor-pointer hover:bg-surface-hover"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {formatRelativeTime(entry.timestamp)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {entry.callerLabel}
                  </td>
                  <td className="px-4 py-3 text-body">{entry.intent}</td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLE[entry.outcome]}`}
                    >
                      {entry.outcomeLabel}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <ConfidenceBadge level={entry.confidence} score={entry.confidenceScore} />
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {formatDuration(entry.durationSec)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-center">
                      {entry.redirected ? (
                        <CheckIcon className="h-4 w-4 text-amber" />
                      ) : (
                        <CloseIcon className="h-3.5 w-3.5 text-muted/40" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SortableHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string
  active: boolean
  dir: 'asc' | 'desc'
  onClick: () => void
}) {
  return (
    <th className="px-4 py-3 font-medium">
      <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-1 ${active ? 'text-body' : 'text-muted hover:text-body'}`}
      >
        {label}
        <span className="text-[10px]">
          {active ? (dir === 'asc' ? '↑' : '↓') : ''}
        </span>
      </button>
    </th>
  )
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (v: string) => void
  options: { value: string; label: string }[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
