import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import { EmptyState } from './components/EmptyState'
import { Dashboard } from './pages/Dashboard'
import { LiveCallsPage } from './pages/LiveCallsPage'
import { CallLogPage } from './pages/CallLogPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { AgentBuilderPage } from './pages/AgentBuilderPage'
import { SimulationPage } from './pages/SimulationPage'
import { RolloutPage } from './pages/RolloutPage'
import { ImprovementFeedPage } from './pages/ImprovementFeedPage'
import { DataReadinessPage } from './pages/DataReadinessPage'
import { CompliancePage } from './pages/CompliancePage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { footerNav, primaryNav } from './data/mock'
import type { CallLogSeed } from './types'

function App() {
  const [activeNavId, setActiveNavId] = useState('dashboard')
  const [callLogSeed, setCallLogSeed] = useState<CallLogSeed | undefined>()
  const activeLabel =
    [...primaryNav, ...footerNav].find((n) => n.id === activeNavId)?.label ??
    'Dashboard'

  // The one navigation entry point — used by the sidebar (plain id) and by
  // dashboard drill-downs (id + which Call Log rows to land on). Routing
  // anywhere but Call Log always clears a stale seed from an earlier click.
  function navigate(id: string, seed?: CallLogSeed) {
    setActiveNavId(id)
    setCallLogSeed(id === 'call-log' ? seed : undefined)
  }

  return (
    <AppShell
      title={activeLabel}
      activeNavId={activeNavId}
      onNavSelect={navigate}
    >
      <Page
        id={activeNavId}
        label={activeLabel}
        onBack={() => navigate('dashboard')}
        onNavigate={navigate}
        callLogSeed={callLogSeed}
      />
    </AppShell>
  )
}

function Page({
  id,
  label,
  onBack,
  onNavigate,
  callLogSeed,
}: {
  id: string
  label: string
  onBack: () => void
  onNavigate: (id: string, seed?: CallLogSeed) => void
  callLogSeed?: CallLogSeed
}) {
  switch (id) {
    case 'dashboard':
      return <Dashboard onNavigate={onNavigate} />
    case 'live-calls':
      return <LiveCallsPage />
    case 'call-log':
      return (
        <CallLogPage
          initialSearch={callLogSeed?.search}
          initialOutcomeFilter={callLogSeed?.outcome}
          initialConfidenceFilter={callLogSeed?.confidence}
        />
      )
    case 'knowledge-base':
      return <KnowledgeBasePage />
    case 'agent-builder':
      return <AgentBuilderPage />
    case 'simulation':
      return <SimulationPage />
    case 'rollout':
      return <RolloutPage />
    case 'improvement-feed':
      return <ImprovementFeedPage />
    case 'data-readiness':
      return <DataReadinessPage />
    case 'compliance':
      return <CompliancePage />
    case 'integrations':
      return <IntegrationsPage />
    case 'settings':
      return <SettingsPage />
    default:
      return (
        <EmptyState
          title={`${label} is next`}
          description="This screen is built in a later phase of the plan. The app shell, Pulse Line, and mock data underneath it are already wired up."
          actionLabel="Back to Dashboard"
          onAction={onBack}
        />
      )
  }
}

export default App
