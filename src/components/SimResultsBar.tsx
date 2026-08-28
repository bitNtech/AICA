import type { SimulationRun } from '../types'

/** Part-to-whole composition of a simulation run — a stacked bar, not a
 * donut, per the "3+ category composition" form. Same colors as
 * SimResultBadge so the two stay legible together. */
export function SimResultsBar({ run }: { run: SimulationRun }) {
  const segments = [
    { key: 'beat', label: 'Beat human', value: run.beat, className: 'bg-pulse' },
    { key: 'matched', label: 'Matched human', value: run.matched, className: 'bg-sage' },
    { key: 'worse', label: 'Worse than human', value: run.worse, className: 'bg-amber' },
  ]

  return (
    <div>
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full">
        {segments.map((s) => (
          <div
            key={s.key}
            className={s.className}
            style={{ width: `${(s.value / run.totalCalls) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segments.map((s) => (
          <div key={s.key} className="flex items-center gap-1.5 text-xs">
            <span className={`h-2 w-2 rounded-full ${s.className}`} />
            <span className="text-muted">{s.label}</span>
            <span className="font-mono text-body">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
