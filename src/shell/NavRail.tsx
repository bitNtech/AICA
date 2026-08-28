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

/** Conceptual grouping of the primary nav — same items, just structured so
 * the rail reads as a system rather than a flat list. */
const GROUPS: { label: string; ids: string[] }[] = [
  { label: 'Operations', ids: ['dashboard', 'live-calls', 'call-log'] },
  {
    label: 'Intelligence',
    ids: ['knowledge-base', 'agent-builder', 'simulation', 'data-readiness'],
  },
  { label: 'Deployment', ids: ['rollout', 'improvement-feed'] },
]

interface NavRailProps {
  activeId: string
  onSelect: (id: string) => void
}

export function NavRail({ activeId, onSelect }: NavRailProps) {
  const [collapsed, setCollapsed] = useState(false)
  const expanded = !collapsed
  const byId = Object.fromEntries(primaryNav.map((item) => [item.id, item]))

  return (
    <nav
      aria-label="Primary"
      className={`flex h-screen w-[72px] shrink-0 flex-col bg-ink-teal text-mist transition-[width] duration-150 ease-out ${
        expanded ? 'lg:w-64' : 'lg:w-[72px]'
      }`}
    >
      <div className="flex h-16 shrink-0 items-center gap-2.5 px-4 lg:px-5">
        <PulseLine
          mode="idle"
          height={20}
          className="w-8 shrink-0 text-pulse"
          aria-label="AICA"
        />
        {expanded && (
          <span className="hidden truncate font-display text-lg font-normal tracking-tight text-white lg:inline">
            AICA
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          className="ml-auto hidden h-7 w-7 shrink-0 items-center justify-center rounded-md text-mist/40 transition-colors hover:bg-white/[0.06] hover:text-mist lg:flex"
        >
          {collapsed ? (
            <ChevronsRightIcon className="h-4 w-4" />
          ) : (
            <ChevronsLeftIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-3 lg:px-3">
        {GROUPS.map((group) => (
          <div key={group.label}>
            {expanded && (
              <p className="hidden px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-mist/35 lg:block">
                {group.label}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {group.ids.map((id) => {
                const item = byId[id]
                if (!item) return null
                return (
                  <NavRow
                    key={item.id}
                    item={item}
                    active={item.id === activeId}
                    onSelect={onSelect}
                    expanded={expanded}
                  />
                )
              })}
            </ul>
          </div>
        ))}
      </div>

      {expanded && <PulseTicker onOpenLiveCalls={() => onSelect('live-calls')} />}

      <div className="border-t border-white/[0.07] px-2 py-3 lg:px-3">
        {expanded && (
          <p className="hidden px-2.5 pb-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-mist/35 lg:block">
            Governance
          </p>
        )}
        <ul className="flex flex-col gap-0.5">
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
      </div>
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
            ? 'bg-pulse/[0.12] text-white'
            : muted
              ? 'text-mist/45 hover:bg-white/[0.05] hover:text-mist/75'
              : 'text-mist/70 hover:bg-white/[0.05] hover:text-white'
        }`}
      >
        {active && (
          <span
            className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-pulse shadow-[0_0_8px_var(--color-pulse)]"
            aria-hidden="true"
          />
        )}
        <Icon
          className={`h-[18px] w-[18px] shrink-0 ${active ? 'text-pulse' : 'opacity-90'}`}
        />
        {expanded && (
          <span className="hidden truncate font-medium lg:inline">
            {item.label}
          </span>
        )}
        {expanded && item.badge ? (
          <span className="ml-auto hidden rounded-full bg-pulse px-1.5 py-0.5 text-[11px] font-semibold leading-none text-ink-teal lg:inline">
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
    <div className="hidden border-t border-white/[0.07] px-3 py-3 lg:block">
      <p className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-mist/40">
        <span className="relative flex h-1.5 w-1.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pulse opacity-60" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-pulse" />
        </span>
        {mockLiveCalls.length} calls in progress
      </p>
      <ul className="flex flex-col gap-1.5">
        {visible.map((call) => (
          <li key={call.id}>
            <button
              type="button"
              onClick={onOpenLiveCalls}
              className="flex w-full items-center gap-2 rounded-md px-1.5 py-1 text-left hover:bg-white/[0.05]"
            >
              <PulseLine
                mode="live"
                height={16}
                className="w-8 shrink-0 text-pulse"
                aria-label={`Live call: ${call.intent}`}
              />
              <span className="truncate text-xs text-mist/65">{call.intent}</span>
            </button>
          </li>
        ))}
      </ul>
      {overflow > 0 && (
        <button
          type="button"
          onClick={onOpenLiveCalls}
          className="mt-1.5 text-[11px] font-medium text-mist/40 hover:text-mist/70"
        >
          +{overflow} more
        </button>
      )}
    </div>
  )
}
