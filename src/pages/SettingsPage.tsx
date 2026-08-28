import { useState } from 'react'
import { mockOrg } from '../data/mock'
import { Toggle } from '../components/Toggle'

const USERS = [
  { name: 'Priya N.', email: 'priya@riversidefamily.example', role: 'Admin' },
  { name: 'Marcus D.', email: 'marcus@riversidefamily.example', role: 'Reviewer' },
  { name: 'Aisha K.', email: 'aisha@riversidefamily.example', role: 'Read-only' },
]

const NOTIFICATIONS = [
  { id: 'escalations', label: 'A call gets redirected with no staff available', defaultOn: true },
  { id: 'conflicts', label: 'A new knowledge base conflict is found', defaultOn: true },
  { id: 'weekly-digest', label: 'Weekly improvement feed digest', defaultOn: true },
  { id: 'rollout', label: 'Rollout stage changes', defaultOn: false },
]

export function SettingsPage() {
  return (
    <div className="flex flex-col gap-8">
      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Organization</h2>
        <div className="flex items-center gap-4 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-ink-teal text-sm font-semibold text-mist">
            {mockOrg.initials}
          </span>
          <div>
            <p className="text-sm font-medium text-body">{mockOrg.name}</p>
            <p className="text-xs text-muted">Health-sector front desk · AICA plan</p>
          </div>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Users</h2>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-hairline text-xs text-muted">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {USERS.map((u) => (
                <tr key={u.email}>
                  <td className="px-4 py-3 text-body">{u.name}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{u.email}</td>
                  <td className="px-4 py-3 text-body">{u.role}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-body">Notifications</h2>
        <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
          {NOTIFICATIONS.map((n) => (
            <NotificationRow key={n.id} label={n.label} defaultOn={n.defaultOn} />
          ))}
        </div>
      </section>
    </div>
  )
}

function NotificationRow({ label, defaultOn }: { label: string; defaultOn: boolean }) {
  const [on, setOn] = useState(defaultOn)
  return (
    <label className="flex items-center justify-between gap-4">
      <span className="text-sm text-body">{label}</span>
      <Toggle checked={on} onChange={setOn} label={label} />
    </label>
  )
}
