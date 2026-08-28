import { useState } from 'react'
import type { ReactElement } from 'react'
import { footerNav, mockLiveCalls, primaryNav } from '../data/mock'
import { PulseLine } from '../components/PulseLine'
import type { NavItem } from '../types'
import {
  AgentBuilderIcon,
  CallLogIcon,
  ChevronsLeftIcon,
  ChevronsRightIcon,
  ComplianceIcon,
  DashboardIcon,
  DataReadinessIcon,
  ImprovementFeedIcon,
  IntegrationsIcon,
  KnowledgeBaseIcon,
  LiveCallsIcon,
  RolloutIcon,
  SettingsIcon,
  SimulationIcon,
} from '../components/icons'

const ICONS: Record<string, (props: { className?: string }) => ReactElement> = {
  dashboard: DashboardIcon,
  'live-calls': LiveCallsIcon,
  'call-log': CallLogIcon,
  'knowledge-base': KnowledgeBaseIcon,
  'agent-builder': AgentBuilderIcon,
  simulation: SimulationIcon,
  rollout: RolloutIcon,
  'improvement-feed': ImprovementFeedIcon,
  'data-readiness': DataReadinessIcon,
  compliance: ComplianceIcon,
  integrations: IntegrationsIcon,
  settings: SettingsIcon,
}

interface NavRailProps {
  activeId: string
  onSelect: (id: string) => void
}

export function NavRail({ activeId, onSelect }: NavRailProps) {
  const [collapsed, setCollapsed] = useState(false)
  const expanded = !collapsed

  return (
    <nav
      aria-label="Primary"
      className={`flex h-screen w-20 shrink-0 flex-col border-r border-black/10 bg-ink-teal text-mist transition-[width] duration-150 ease-out ${
        expanded ? 'lg:w-60' : 'lg:w-20'
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-2 px-4 lg:px-5">
        <PulseLine
          mode="idle"
          height={20}
          className="w-8 shrink-0 text-pulse"
          aria-label="AICA"
        />
        {expanded && (
          <span className="hidden truncate font-display text-lg font-normal tracking-tight lg:inline">
            AICA
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="ml-auto hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-mist/50 hover:bg-white/5 hover:text-mist lg:flex"
        >
          {collapsed ? (
            <ChevronsRightIcon className="h-4 w-4" />
          ) : (
            <ChevronsLeftIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <ul className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 py-2 lg:px-3">
        {primaryNav.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={item.id === activeId}
            onSelect={onSelect}
            expanded={expanded}
          />
        ))}
      </ul>

      {expanded && <PulseTicker onOpenLiveCalls={() => onSelect('live-calls')} />}

      <ul className="flex flex-col gap-0.5 border-t border-white/10 px-2 py-3 lg:px-3">
        {footerNav.map((item) => (
          <NavRow
            key={item.id}
            item={item}
            active={item.id === activeId}
            onSelect={onSelect}
            expanded={expanded}
            muted
          />
        ))}
      </ul>
    </nav>
  )
}

function NavRow({
  item,
  active,
  onSelect,
  expanded,
  muted,
}: {
  item: NavItem
  active: boolean
  onSelect: (id: string) => void
  expanded: boolean
  muted?: boolean
}) {
  const Icon = ICONS[item.id] ?? DashboardIcon
  return (
    <li>
      <button
        type="button"
        title={item.label}
        onClick={() => onSelect(item.id)}
        aria-current={active ? 'page' : undefined}
        className={`group relative flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-sm transition-colors duration-150 lg:px-3 ${
          active
            ? 'bg-white/10 text-white'
            : muted
              ? 'text-mist/50 hover:bg-white/5 hover:text-mist/80'
              : 'text-mist/75 hover:bg-white/5 hover:text-white'
        }`}
      >
        {active && (
          <span
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-pulse"
            aria-hidden="true"
          />
        )}
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-pulse' : ''}`}
        />
        {expanded && (
          <span className="hidden truncate font-medium lg:inline">
            {item.label}
          </span>
        )}
        {expanded && item.badge ? (
          <span className="ml-auto hidden rounded-full bg-pulse px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white lg:inline">
            {item.badge}
          </span>
        ) : null}
      </button>
    </li>
  )
}

function PulseTicker({ onOpenLiveCalls }: { onOpenLiveCalls: () => void }) {
  const visible = mockLiveCalls.slice(0, 3)
  const overflow = mockLiveCalls.length - visible.length

  return (
    <div className="hidden border-t border-white/10 px-3 py-3 lg:block">
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-mist/45">
        <span className="h-1.5 w-1.5 rounded-full bg-pulse" aria-hidden="true" />
        {mockLiveCalls.length} calls in progress
      </p>
      <ul className="flex flex-col gap-1.5">
        {visible.map((call) => (
          <li key={call.id}>
            <button
              type="button"
              onClick={onOpenLiveCalls}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/5"
            >
              <PulseLine
                mode="live"
                height={16}
                className="w-8 shrink-0 text-pulse"
                aria-label={`Live call: ${call.intent}`}
              />
              <span className="truncate text-xs text-mist/70">{call.intent}</span>
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOpenLiveCalls}
          className="mt-1.5 text-[11px] font-medium text-mist/45 hover:text-mist/70"
        >
          +{overflow} more
        </button>
      )}
    </div>
  )
}
