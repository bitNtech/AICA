import { useMemo, useState } from 'react'
import {
  mockAuditLog,
  mockDocConflicts,
  mockRedactionExamples,
  mockRoles,
  mockUsers,
} from '../data/mock'
import { formatRelativeTime } from '../lib/format'
import { redactText } from '../lib/redact'
import { downloadCsv } from '../lib/exportCsv'
import { CheckIcon, CloseIcon, SearchIcon } from '../components/icons'
import { Toggle } from '../components/Toggle'
import { useUiStore } from '../store/ui'
import type { Role } from '../types'

export function CompliancePage({ onNavigate }: { onNavigate: (id: string) => void }) {
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
        <Stat
          label="Open document conflicts"
          value={mockDocConflicts.length}
          tone={mockDocConflicts.length > 0 ? 'amber' : 'sage'}
        />
        <Stat label="Roles defined" value={mockRoles.length} />
      </section>

      <RedactionSection />
      <ConsentSection />
      <RolesSection onNavigate={onNavigate} />
      <AuditTrailSection />
    </div>
  )
}

function RedactionSection() {
  const [input, setInput] = useState(mockRedactionExamples[0]?.original ?? '')
  const redacted = useMemo(() => redactText(input), [input])

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-body">PHI/PII redaction</h2>
      <p className="mb-3 text-sm text-muted">
        Every transcript is scrubbed before storage. Try it yourself — type or paste sample text
        below and watch it redact live.
      </p>
      <div className="card p-4">
        <div className="mb-2 flex flex-wrap gap-2">
          {mockRedactionExamples.map((ex, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setInput(ex.original)}
              className="btn-ghost !px-3 !py-1 text-xs"
            >
              Load example {i + 1}
            </button>
          ))}
        </div>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={3}
          placeholder="Type or paste call transcript text…"
          className="w-full rounded-xl border border-hairline bg-canvas px-3 py-2 font-mono text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
        />
        <div className="mt-3 rounded-xl border border-sage/30 bg-sage/10 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-sage">Redacted</p>
          <p className="mt-1 whitespace-pre-wrap font-mono text-sm text-body">
            {redacted || <span className="text-faint">Nothing to redact yet.</span>}
          </p>
        </div>
        <p className="mt-2 text-xs text-faint">
          Pattern-based demo covering names, dates of birth, phone numbers, policy IDs, emails, and
          street addresses — production redaction layers in a fuller PII model on top.
        </p>
      </div>
    </section>
  )
}

function ConsentSection() {
  const [strictMode, setStrictMode] = useState(false)

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-body">Consent</h2>
      <p className="mb-3 text-sm text-muted">
        Recording consent captured at the start of every call.
      </p>
      <div className="card overflow-hidden">
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
              <td className="px-4 py-3 text-muted">
                {strictMode
                  ? 'Explicit verbal consent required before recording continues, even though the law only requires one party to agree.'
                  : "Recorded after AICA's opening disclosure."}
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-body">Two-party consent state</td>
              <td className="px-4 py-3 text-muted">
                Explicit verbal consent required before recording continues; call is not stored if
                consent is declined.
              </td>
            </tr>
          </tbody>
        </table>
        <div className="flex items-center justify-between gap-4 border-t border-hairline px-4 py-3">
          <div>
            <p className="text-sm text-body">Require explicit verbal consent everywhere</p>
            <p className="text-xs text-muted">
              Hold single-party-state calls to the stricter two-party standard.
            </p>
          </div>
          <Toggle checked={strictMode} onChange={setStrictMode} label="Require explicit consent everywhere" />
        </div>
      </div>
    </section>
  )
}

function RolesSection({ onNavigate }: { onNavigate: (id: string) => void }) {
  const openDrawer = useUiStore((s) => s.openDrawer)

  function openRole(role: Role) {
    const holders = mockUsers.filter((u) => u.roleId === role.id)
    openDrawer({
      title: role.name,
      subtitle: role.description,
      body: (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Can do</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {role.canDo.map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-body">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">Cannot do</p>
              <ul className="mt-2 flex flex-col gap-1.5">
                {role.cannotDo.length === 0 ? (
                  <li className="text-sm text-faint">Nothing — full access.</li>
                ) : (
                  role.cannotDo.map((c) => (
                    <li key={c} className="flex items-start gap-2 text-sm text-muted">
                      <CloseIcon className="mt-0.5 h-3 w-3 shrink-0 text-critical/70" />
                      {c}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              {holders.length} {holders.length === 1 ? 'person holds' : 'people hold'} this role
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {holders.map((u) => (
                <li key={u.id} className="text-sm text-body">
                  {u.name} <span className="text-xs text-muted">· {u.email}</span>
                </li>
              ))}
              {holders.length === 0 && <li className="text-sm text-faint">Nobody yet.</li>}
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('settings')}
            className="btn-secondary self-start"
          >
            Manage users →
          </button>
        </div>
      ),
    })
  }

  return (
    <section>
      <h2 className="mb-1 text-sm font-semibold text-body">Roles</h2>
      <p className="mb-3 text-sm text-muted">
        What each role can and can't touch, in plain English. Click one to see who holds it.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {mockRoles.map((role) => {
          const holderCount = mockUsers.filter((u) => u.roleId === role.id).length
          return (
            <button
              key={role.id}
              type="button"
              onClick={() => openRole(role)}
              className="card-interactive p-5 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-display text-lg font-normal text-body">{role.name}</p>
                <span className="shrink-0 rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                  {holderCount}
                </span>
              </div>
              <p className="mt-1 text-sm text-muted">{role.description}</p>
              <ul className="mt-3 flex flex-col gap-1.5">
                {role.canDo.slice(0, 2).map((c) => (
                  <li key={c} className="flex items-start gap-2 text-sm text-body">
                    <CheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sage" />
                    {c}
                  </li>
                ))}
              </ul>
            </button>
          )
        })}
      </div>
    </section>
  )
}

function AuditTrailSection() {
  const [search, setSearch] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return mockAuditLog
    return mockAuditLog.filter((entry) =>
      `${entry.actor} ${entry.action} ${entry.target}`.toLowerCase().includes(q),
    )
  }, [search])

  function exportRows() {
    downloadCsv(
      `audit-trail-${new Date().toISOString().slice(0, 10)}.csv`,
      ['Time', 'Who', 'Action', 'Target'],
      rows.map((e) => [e.timestamp, e.actor, e.action, e.target]),
    )
  }

  return (
    <section>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-body">Audit trail</h2>
        <div className="flex items-center gap-2">
          <label className="group relative">
            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-faint" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search who, what, or where…"
              className="input w-64 !py-1.5 pl-8 text-xs"
            />
          </label>
          <button
            type="button"
            onClick={exportRows}
            disabled={rows.length === 0}
            className="btn-ghost !px-3 !py-1.5 text-xs disabled:opacity-40"
          >
            Export CSV
          </button>
        </div>
      </div>
      <p className="mb-3 text-sm text-muted">
        Every change to a node, threshold, or document — read-only.
      </p>
      {rows.length === 0 ? (
        <div className="card px-5 py-6 text-center text-sm text-muted">
          No audit events match "{search}".
        </div>
      ) : (
        <div className="card overflow-hidden">
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
              {rows.map((entry) => (
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
      )}
    </section>
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
