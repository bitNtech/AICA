import { useEffect, useRef, useState } from 'react'
import type { AgentStatus, UsageMetric } from '../types'
import { mockOrg, mockUsage } from '../data/mock'
import { ChevronDownIcon, SearchIcon } from '../components/icons'

const STATUS_CONFIG: Record<
  AgentStatus,
  { label: string; sub: string; dot: string }
> = {
  answering: { label: 'AICA is answering', sub: 'All systems operational', dot: 'bg-sage' },
  paused: { label: 'AICA is paused', sub: 'No calls are being answered', dot: 'bg-amber' },
  degraded: { label: 'Degraded', sub: 'Check integrations', dot: 'bg-critical' },
}

interface TopBarProps {
  title: string
  liveCallCount: number
  agentStatus: AgentStatus
}

export function TopBar({ title, liveCallCount, agentStatus }: TopBarProps) {
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
            className="w-52 rounded-full border border-hairline bg-canvas py-1.5 pl-9 pr-12 text-sm text-body placeholder:text-faint transition-[width,border-color] duration-150 focus:w-72 focus:border-pulse/50 focus:outline-none lg:w-64 lg:focus:w-80"
          />
          <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 items-center gap-0.5 rounded border border-hairline bg-surface px-1.5 py-0.5 font-mono text-[10px] text-faint md:inline-flex">
            ⌘K
          </kbd>
        </label>
        <OrgMenu />
      </div>
    </header>
  )
}

function OrgMenu() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-hairline py-1 pl-1 pr-2.5 transition-colors hover:border-pulse/30 hover:bg-surface-hover"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-teal text-[11px] font-semibold text-mist">
          {mockOrg.initials}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm font-medium text-body sm:inline">
          {mockOrg.name}
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-faint" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-64 rounded-2xl border border-hairline bg-surface-elevated py-1.5 shadow-lg">
          <div className="flex items-center gap-2.5 px-3 py-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-teal text-xs font-semibold text-mist">
              {mockOrg.initials}
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-faint">
                {mockOrg.plan}
              </p>
              <p className="truncate text-sm font-medium text-body">{mockOrg.name}</p>
            </div>
          </div>
          <div className="mx-1.5 mb-1 border-t border-hairline" />
          <div className="px-3 pb-2 pt-1.5">
            <p className="pb-2 text-[10.5px] font-semibold uppercase tracking-wider text-faint">
              Usage this month
            </p>
            <div className="flex flex-col gap-3">
              {mockUsage.map((metric) => (
                <UsageRow key={metric.id} metric={metric} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function UsageRow({ metric }: { metric: UsageMetric }) {
  const percent = Math.min(100, Math.round((metric.used / metric.limit) * 100))
  const near = percent >= 90

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-body">{metric.label}</span>
        <span className="font-medium text-body">{metric.value}</span>
      </div>
      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-canvas">
        <div
          className={`h-full rounded-full ${near ? 'bg-critical' : 'bg-pulse'}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-faint">
        {percent}% of {metric.limit.toLocaleString()} {metric.unit} included
      </p>
    </div>
  )
}
