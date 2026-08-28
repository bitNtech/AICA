import { useEffect, useRef, useState } from 'react'
import type { AgentStatus } from '../types'
import { mockOrg } from '../data/mock'
import { ChevronDownIcon, MoonIcon, SearchIcon, SunIcon } from '../components/icons'
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme'

const STATUS_CONFIG: Record<AgentStatus, { label: string; dot: string }> = {
  answering: { label: 'AICA is answering', dot: 'bg-sage' },
  paused: { label: 'AICA is paused', dot: 'bg-amber' },
  degraded: { label: 'Degraded — check integrations', dot: 'bg-pulse' },
}

interface TopBarProps {
  title: string
  liveCallCount: number
  agentStatus: AgentStatus
}

export function TopBar({ title, liveCallCount, agentStatus }: TopBarProps) {
  const status = STATUS_CONFIG[agentStatus]
  const [theme, setTheme] = useState<Theme>(
    () => getStoredTheme() ?? (document.documentElement.classList.contains('dark') ? 'dark' : 'light'),
  )

  function toggleTheme() {
    const next: Theme = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    applyTheme(next)
  }

  return (
    <header className="flex h-16 shrink-0 items-center gap-4 border-b border-hairline bg-surface px-6">
      <h1 className="font-display text-xl font-normal text-body">{title}</h1>

      <div className="flex items-center gap-2 rounded-full bg-pulse/10 px-3 py-1 text-sm font-medium text-pulse">
        <span className="h-1.5 w-1.5 rounded-full bg-pulse" aria-hidden="true" />
        {liveCallCount} live {liveCallCount === 1 ? 'call' : 'calls'}
      </div>

      <div className="flex items-center gap-2 rounded-full bg-canvas px-3 py-1 text-sm font-medium text-muted">
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} aria-hidden="true" />
        {status.label}
      </div>

      <div className="ml-auto flex items-center gap-3">
        <label className="relative">
          <SearchIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
          <input
            type="search"
            placeholder="Search calls, documents..."
            className="w-64 rounded-lg border border-hairline bg-canvas py-1.5 pl-8 pr-3 text-sm text-body placeholder:text-muted focus:outline-none"
          />
        </label>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-hairline text-muted hover:text-body"
        >
          {theme === 'dark' ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
        </button>
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
        className="flex items-center gap-2 rounded-lg border border-hairline py-1 pl-1 pr-2 hover:bg-canvas"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-ink-teal text-[11px] font-semibold text-mist">
          {mockOrg.initials}
        </span>
        <span className="hidden max-w-[140px] truncate text-sm font-medium text-body sm:inline">
          {mockOrg.name}
        </span>
        <ChevronDownIcon className="h-3.5 w-3.5 text-muted" />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-30 mt-2 w-56 rounded-lg border border-hairline bg-surface py-1.5 shadow-lg">
          <p className="truncate px-3 py-1.5 text-xs font-medium text-muted">
            {mockOrg.name}
          </p>
          <MenuItem label="Compliance & Audit" />
          <MenuItem label="Integrations" />
          <MenuItem label="Settings" />
        </div>
      )}
    </div>
  )
}

function MenuItem({ label }: { label: string }) {
  return (
    <button
      type="button"
      className="block w-full px-3 py-1.5 text-left text-sm text-body hover:bg-canvas"
    >
      {label}
    </button>
  )
}
