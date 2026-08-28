import { useEffect, useRef, useState } from 'react'
import type { AgentStatus, CallLogSeed } from '../types'
import { mockAttentionItems, mockCurrentUser, mockRoles } from '../data/mock'
import { AttentionList } from '../components/AttentionList'
import { BellIcon, SearchIcon } from '../components/icons'

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
}

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; sub: string; dot: string }
> = {
  answering: { label: 'AICA is answering', sub: 'All systems operational', dot: 'bg-sage' },
  paused: { label: 'AICA is paused', sub: 'Manual workforce is handling calls', dot: 'bg-amber' },
  degraded: { label: 'Degraded', sub: 'Check integrations', dot: 'bg-critical' },
}

interface TopBarProps {
  title: string
  liveCallCount: number
  agentStatus: AgentStatus
  onNavigate: (id: string, filter?: CallLogSeed) => void
}

export function TopBar({ title, liveCallCount, agentStatus, onNavigate }: TopBarProps) {
  const status = STATUS_CONFIG[agentStatus]

  return (
    <header className="relative z-10 flex h-16 shrink-0 items-center gap-3 border-b border-hairline bg-surface px-4 sm:px-6">
      <h1 className="shrink-0 truncate font-display text-xl font-normal text-body">{title}</h1>

      <div className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full bg-pulse/10 px-3 py-1 text-sm font-medium text-pulse lg:flex">
        <span className="relative flex h-1.5 w-1.5 shrink-0" aria-hidden="true">
          {liveCallCount > 0 && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
          )}
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
        </span>
        {liveCallCount} live {liveCallCount === 1 ? 'call' : 'calls'}
      </div>

      <div className="hidden shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-hairline bg-canvas px-3 py-1 text-sm text-body xl:flex">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${status.dot}`} aria-hidden="true" />
        <span className="font-medium">{status.label}</span>
        <span className="hidden text-xs text-faint lg:inline">· {status.sub}</span>
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className="group relative hidden sm:block">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input
            type="search"
            placeholder="Search calls, patients, documents…"
            className="w-52 rounded-full border border-hairline bg-canvas py-1.5 pl-9 pr-4 text-sm text-body placeholder:text-faint transition-[width,border-color] duration-150 focus:w-72 focus:border-pulse/50 focus:outline-none lg:w-64 lg:focus:w-80"
          />
        </label>
        <NotificationMenu onNavigate={onNavigate} />
        <UserMenu onNavigate={onNavigate} />
      </div>
    </header>
  )
}

function UserMenu({ onNavigate }: { onNavigate: (id: string, filter?: CallLogSeed) => void }) {
  const role = mockRoles.find((r) => r.id === mockCurrentUser.roleId)

  return (
    <button
      type="button"
      onClick={() => onNavigate('settings')}
      title={`${mockCurrentUser.name} · ${role?.name ?? ''} — open Settings`}
      className="flex shrink-0 items-center gap-2 rounded-full border border-hairline py-1 pl-1 pr-2.5 transition-colors hover:border-pulse/30 hover:bg-surface-hover"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-teal text-[11px] font-semibold text-mist">
        {initials(mockCurrentUser.name)}
      </span>
      <span className="hidden max-w-[140px] truncate text-sm font-medium text-body sm:inline">
        {mockCurrentUser.name}
      </span>
    </button>
  )
}

function NotificationMenu({ onNavigate }: { onNavigate: (id: string, filter?: CallLogSeed) => void }) {
  const [open, setOpen] = useState(false)
  const [attentionItems, setAttentionItems] = useState(mockAttentionItems)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  function dismissAttentionItem(id: string) {
    setAttentionItems((prev) => prev.filter((item) => item.id !== id))
  }

  function navigateAndClose(id: string, filter?: CallLogSeed) {
    onNavigate(id, filter)
    setOpen(false)
  }

  const worstSeverity = attentionItems.some((i) => i.severity === 'critical')
    ? 'critical'
    : attentionItems.some((i) => i.severity === 'warning')
      ? 'warning'
      : 'info'
  const badgeClass =
    worstSeverity === 'critical'
      ? 'bg-critical text-ink-teal'
      : worstSeverity === 'warning'
        ? 'bg-amber text-ink-teal'
        : 'bg-info text-ink-teal'

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label="Notifications"
        className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-hairline text-body transition-colors hover:border-pulse/30 hover:bg-surface-hover"
      >
        <BellIcon className="h-4.5 w-4.5" />
        {attentionItems.length > 0 && (
          <span
            className={`absolute -right-1 -top-1 flex h-4.5 min-w-4.5 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none ${badgeClass}`}
          >
            {attentionItems.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-96 overflow-hidden rounded-2xl border border-hairline bg-surface-elevated shadow-lg">
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-body">Notifications</p>
              {attentionItems.length > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${badgeClass}`}>
                  {attentionItems.length}
                </span>
              )}
            </div>
            {attentionItems.length > 0 && (
              <button
                type="button"
                onClick={() => setAttentionItems([])}
                className="text-xs font-medium text-pulse hover:underline"
              >
                Clear all
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto p-3">
            <AttentionList
              items={attentionItems}
              onNavigate={navigateAndClose}
              onDismiss={dismissAttentionItem}
            />
          </div>
        </div>
      )}
    </div>
  )
}
