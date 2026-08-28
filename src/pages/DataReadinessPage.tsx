import { mockOverallReadiness, mockReadinessSources } from '../data/mock'
import { DonutMeter } from '../components/DonutMeter'

export function DataReadinessPage() {
  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-wrap items-center gap-6 p-6">
        <DonutMeter
          value={mockOverallReadiness}
          label="Overall data readiness"
          colorClassName="text-insight"
          trackClassName="text-insight/15"
        />
        <div>
          <p className="flex items-center gap-2 text-[10.5px] font-semibold uppercase tracking-wider text-insight">
            <span className="h-1.5 w-1.5 rounded-full bg-insight" />
            Calibrated estimate
          </p>
          <p className="mt-1 font-display text-lg font-normal text-body">
            Your data supports ~{mockOverallReadiness}% auto-coverage today
          </p>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Not a promise — it grows as call history, CRM records, and
            documents fill in. Every source below has a plain next step to
            raise it.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {mockReadinessSources.map((source) => {
          const healthy = source.percent >= 60
          return (
            <div key={source.id} className="card flex flex-col gap-3 p-5">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-body">{source.label}</p>
                <DonutMeter
                  value={source.percent}
                  label={source.label}
                  colorClassName={healthy ? 'text-sage' : 'text-amber'}
                  trackClassName={healthy ? 'text-sage/15' : 'text-amber/15'}
                />
              </div>
              <p className="text-sm text-muted">{source.detail}</p>
              <p className="mt-auto flex items-start gap-2 rounded-lg bg-canvas px-3 py-2 text-xs text-body">
                <span
                  className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${healthy ? 'bg-sage' : 'bg-amber'}`}
                />
                {source.nextStep}
              </p>
            </div>
          )
        })}
      </div>
    </div>
  )
}
