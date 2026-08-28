import { mockIntegrations } from '../data/mock'
import type { IntegrationStatus } from '../types'
import { IntegrationsIcon } from '../components/icons'

const STATUS_CONFIG: Record<IntegrationStatus, { label: string; className: string; dot: string }> = {
  connected: { label: 'Connected', className: 'bg-sage/12 text-sage', dot: 'bg-sage' },
  disconnected: { label: 'Not connected', className: 'bg-muted/12 text-muted', dot: 'bg-muted' },
  error: { label: 'Needs attention', className: 'bg-critical/12 text-critical', dot: 'bg-critical' },
}

export function IntegrationsPage() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {mockIntegrations.map((integration) => {
        const status = STATUS_CONFIG[integration.status]
        return (
          <div
            key={integration.id}
            className="flex items-start gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
              <IntegrationsIcon className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-body">{integration.name}</p>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
                  {status.label}
                </span>
              </div>
              <p className="mt-0.5 text-xs uppercase tracking-wide text-muted">
                {integration.category}
              </p>
              <p className="mt-2 text-sm text-muted">{integration.detail}</p>
              <button type="button" className="btn-secondary mt-3 !px-3.5 !py-1.5 text-xs font-semibold">
                {integration.status === 'connected' ? 'Manage' : 'Connect'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
