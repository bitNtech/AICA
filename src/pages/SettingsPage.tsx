import { useState } from 'react'
import { mockOrg, mockRoles, mockUsers } from '../data/mock'
import type { UserAccount } from '../types'
import { Toggle } from '../components/Toggle'
import { useUiStore } from '../store/ui'

const NOTIFICATIONS = [
  { id: 'escalations', label: 'A call gets redirected with no staff available', defaultOn: true },
  { id: 'conflicts', label: 'A new knowledge base conflict is found', defaultOn: true },
  { id: 'weekly-digest', label: 'Weekly improvement feed digest', defaultOn: true },
  { id: 'published', label: 'An agent config is published', defaultOn: false },
]

function roleName(roleId: string): string {
  return mockRoles.find((r) => r.id === roleId)?.name ?? roleId
}

export function SettingsPage() {
  const [users, setUsers] = useState<UserAccount[]>(mockUsers)
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  function updateRole(id: string, roleId: string) {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, roleId } : u)))
  }

  function openRoleEditor(user: UserAccount) {
    openDrawer({
      title: user.name,
      subtitle: user.email,
      body: (
        <UserRoleForm
          user={user}
          onSave={(roleId) => {
            updateRole(user.id, roleId)
            closeDrawer()
          }}
        />
      ),
    })
  }

  function openInvite() {
    openDrawer({
      title: 'Invite a user',
      subtitle: 'They get an email invite to join this workspace.',
      body: (
        <InviteUserForm
          onSave={(user) => {
            setUsers((prev) => [...prev, { ...user, id: `user-${Date.now()}` }])
            closeDrawer()
          }}
        />
      ),
    })
  }

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-body">Users</h2>
          <button
            type="button"
            onClick={openInvite}
            className="btn-secondary !px-3.5 !py-1.5 text-xs"
          >
            + Invite user
          </button>
        </div>
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-surface-hover">
                    <td className="px-4 py-3 text-body">{u.name}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                      {u.email}
                    </td>
                    <td className="px-4 py-3 text-body">{roleName(u.roleId)}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openRoleEditor(u)}
                        className="text-xs font-medium text-pulse hover:underline"
                      >
                        Change role
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

function UserRoleForm({
  user,
  onSave,
}: {
  user: UserAccount
  onSave: (roleId: string) => void
}) {
  const [roleId, setRoleId] = useState(user.roleId)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {mockRoles.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => setRoleId(r.id)}
            aria-pressed={roleId === r.id}
            className={`rounded-xl border p-3.5 text-left transition-colors duration-150 ${
              roleId === r.id
                ? 'border-pulse bg-pulse/10'
                : 'border-hairline bg-surface hover:bg-surface-hover'
            }`}
          >
            <p className="text-sm font-medium text-body">{r.name}</p>
            <p className="mt-0.5 text-xs text-muted">{r.description}</p>
          </button>
        ))}
      </div>
      <button type="button" onClick={() => onSave(roleId)} className="btn-primary self-start">
        Save role
      </button>
    </div>
  )
}

function InviteUserForm({
  onSave,
}: {
  onSave: (user: { name: string; email: string; roleId: string }) => void
}) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [roleId, setRoleId] = useState(mockRoles[mockRoles.length - 1]?.id ?? '')

  return (
    <div className="flex flex-col gap-4">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="invite-name">
          Name
        </label>
        <input
          id="invite-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jordan Lee"
          className="input mt-1.5 w-full"
        />
      </div>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="invite-email">
          Email
        </label>
        <input
          id="invite-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jordan@riversidefamily.example"
          className="input mt-1.5 w-full"
        />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Role</p>
        <div className="mt-1.5 flex flex-col gap-2">
          {mockRoles.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRoleId(r.id)}
              aria-pressed={roleId === r.id}
              className={`rounded-xl border p-3 text-left transition-colors duration-150 ${
                roleId === r.id
                  ? 'border-pulse bg-pulse/10'
                  : 'border-hairline bg-surface hover:bg-surface-hover'
              }`}
            >
              <p className="text-sm font-medium text-body">{r.name}</p>
            </button>
          ))}
        </div>
      </div>
      <button
        type="button"
        disabled={!name.trim() || !email.trim()}
        onClick={() => onSave({ name: name.trim(), email: email.trim(), roleId })}
        className="btn-primary self-start"
      >
        Send invite
      </button>
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
