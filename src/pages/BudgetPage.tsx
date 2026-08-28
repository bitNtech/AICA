import { mockOrg, mockUsage } from '../data/mock'
import type { UsageMetric } from '../types'

export function BudgetPage() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <div className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-teal text-sm font-semibold text-mist">
            {mockOrg.initials}
          </span>
          <div>
            <p className="text-sm font-medium text-body">{mockOrg.name}</p>
            <p className="text-xs text-muted">{mockOrg.plan}</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Usage this month</h2>
        <div className="flex flex-col gap-5 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          {mockUsage.map((metric) => (
            <UsageRow key={metric.id} metric={metric} />
          ))}
        </div>
      </section>
    </div>
  )
}

function UsageRow({ metric }: { metric: UsageMetric }) {
  const percent = Math.min(100, Math.round((metric.used / metric.limit) * 100))
  const near = percent >= 90

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-body">{metric.label}</span>
        <span className="font-medium text-body">{metric.value}</span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${near ? 'bg-critical' : 'bg-pulse'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1.5 text-xs text-muted">
        {percent}% of {metric.limit.toLocaleString()} {metric.unit} included
      </p>
    </div>
  )
}
