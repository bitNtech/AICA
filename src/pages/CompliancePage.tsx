import {
  mockAuditLog,
  mockDocConflicts,
  mockRedactionExamples,
  mockRoles,
} from '../data/mock'
import { formatRelativeTime } from '../lib/format'
import { CheckIcon, CloseIcon } from '../components/icons'

export function CompliancePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="card flex flex-wrap items-center gap-x-8 gap-y-3 p-5">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-sage" />
          <div>
            <p className="text-sm font-medium text-body">Security status</p>
            <p className="text-xs text-muted">All systems operational</p>
          </div>
        </div>
        <div className="h-8 w-px bg-hairline" />
        <Stat label="Audit events logged" value={mockAuditLog.length} />
        <Stat label="Open document conflicts" value={mockDocConflicts.length} tone={mockDocConflicts.length > 0 ? 'amber' : 'sage'} />
        <Stat label="Roles defined" value={mockRoles.length} />
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-body">PHI/PII redaction</h2>
        <p className="mb-3 text-sm text-muted">
          Every transcript is scrubbed before storage. This is what that
          looks like on real sample text.
        </p>
        <div className="flex flex-col gap-3">
          {mockRedactionExamples.map((ex, i) => (
            <div key={i} className="rounded-2xl border border-hairline bg-surface p-4 shadow-sm">
              <p className="font-mono text-sm text-muted line-through decoration-critical/50">
                {ex.original}
              </p>
              <p className="mt-2 font-mono text-sm text-body">{ex.redacted}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-body">Consent</h2>
        <p className="mb-3 text-sm text-muted">
          Recording consent captured at the start of every call.
        </p>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted">
                <th className="px-4 py-3 font-medium">State</th>
                <th className="px-4 py-3 font-medium">Handling</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              <tr>
                <td className="px-4 py-3 text-body">Single-party consent state</td>
                <td className="px-4 py-3 text-muted">Recorded after AICA's opening disclosure.</td>
              </tr>
              <tr>
                <td className="px-4 py-3 text-body">Two-party consent state</td>
                <td className="px-4 py-3 text-muted">
                  Explicit verbal consent required before recording continues; call is not
                  stored if consent is declined.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-body">Roles</h2>
        <p className="mb-3 text-sm text-muted">
          What each role can and can't touch, in plain English.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {mockRoles.map((role) => (
            <div key={role.id} className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
              <p className="font-display text-lg font-normal text-body">{role.name}</p>
              <p className="mt-1 text-sm text-muted">{role.description}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {role.canDo.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-body">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    {c}
                  </li>
                ))}
                {role.cannotDo.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-muted">
                    <CloseIcon className="mt-0.5 h-3 w-3 shrink-0 text-critical/70" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-1 text-sm font-semibold text-body">Audit trail</h2>
        <p className="mb-3 text-sm text-muted">
          Every change to a node, threshold, or document — read-only.
        </p>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted">
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Who</th>
                <th className="px-4 py-3 font-medium">Action</th>
                <th className="px-4 py-3 font-medium">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {mockAuditLog.map((entry) => (
                <tr key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {formatRelativeTime(entry.timestamp)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-body">{entry.actor}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{entry.action}</td>
                  <td className="px-4 py-3 text-body">{entry.target}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function Stat({
  label,
  value,
  tone = 'body',
}: {
  label: string
  value: number
  tone?: 'body' | 'sage' | 'amber'
}) {
  const toneClass = tone === 'sage' ? 'text-sage' : tone === 'amber' ? 'text-amber' : 'text-body'
  return (
    <div>
      <p className={`font-mono text-lg font-medium ${toneClass}`}>{value}</p>
      <p className="text-xs text-muted">{label}</p>
    </div>
  )
}
