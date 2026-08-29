import type { ReactNode } from 'react'
import { mockLiveCalls } from '../data/mock'
import { useAgentStore } from '../store/agent'
import type { CallLogSeed } from '../types'
import { NavRail } from './NavRail'
import { TopBar } from './TopBar'
import { ContextDrawer } from './ContextDrawer'

interface AppShellProps {
  title: string
  activeNavId: string
  onNavSelect: (id: string, filter?: CallLogSeed) => void
  children: ReactNode
}

/** The control-room layout: fixed nav rail, top bar, main canvas, and the
 * one context drawer mechanism — anchored so people build muscle memory. */
export function AppShell({
  title,
  activeNavId,
  onNavSelect,
  children,
}: AppShellProps) {
  const agentStatus = useAgentStore((s) => s.status)

  return (
    <div className="aica-app-shell flex h-screen bg-canvas">
      <NavRail activeId={activeNavId} onSelect={onNavSelect} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          title={title}
          liveCallCount={mockLiveCalls.length}
          agentStatus={agentStatus}
          onNavigate={onNavSelect}
        />
        <main
          key={activeNavId}
          className="aica-page-content flex-1 overflow-y-auto p-6 font-content lg:p-8"
        >
          {children}
        </main>
      </div>
      <ContextDrawer />
    </div>
  )
}
