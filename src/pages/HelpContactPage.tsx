import { mockVendor } from '../data/mock'

const RESOURCES = [
  {
    title: 'Documentation',
    description: 'Setup guides, agent configuration reference, and API docs.',
  },
  {
    title: 'System status',
    description: 'Live uptime and incident history for AICA services.',
  },
  {
    title: 'Release notes',
    description: "What's changed in the latest AICA release.",
  },
]

export function HelpContactPage() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Contact support</h2>
        <div className="flex flex-col gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-body">Need a hand with AICA?</p>
            <p className="mt-1 text-xs text-muted">
              Our support team responds within one business day. {mockVendor.hours}.
            </p>
          </div>
          <a href={`mailto:${mockVendor.supportEmail}`} className="btn-primary shrink-0">
            Email support
          </a>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <ContactRow label="Email" value={mockVendor.supportEmail} />
          <ContactRow label="Phone" value={mockVendor.supportPhone} />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Resources</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {RESOURCES.map((r) => (
            <div
              key={r.title}
              className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm"
            >
              <p className="text-sm font-medium text-body">{r.title}</p>
              <p className="mt-1 text-xs text-muted">{r.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="rounded-2xl border border-hairline bg-canvas p-5 text-center">
          <p className="text-sm font-medium text-body">{mockVendor.tagline}</p>
          <p className="mt-1 text-xs text-faint">
            {mockVendor.website} · {mockVendor.supportEmail}
          </p>
        </div>
      </section>
    </div>
  )
}

function ContactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-hairline bg-surface px-4 py-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</span>
      <span className="text-sm text-body">{value}</span>
    </div>
  )
}
