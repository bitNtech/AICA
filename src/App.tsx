import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import { EmptyState } from './components/EmptyState'
import { LoadingScreen } from './components/LoadingScreen'
import { Dashboard } from './pages/Dashboard'
import { CallLogPage } from './pages/CallLogPage'
import { KnowledgeBasePage } from './pages/KnowledgeBasePage'
import { AgentBuilderPage } from './pages/AgentBuilderPage'
import { SimulationPage } from './pages/SimulationPage'
import { ImprovementFeedPage } from './pages/ImprovementFeedPage'
import { BudgetPage } from './pages/BudgetPage'
import { IntegrationsPage } from './pages/IntegrationsPage'
import { SettingsPage } from './pages/SettingsPage'
import { HelpContactPage } from './pages/HelpContactPage'
import { footerNav, primaryNav, supportNav } from './data/mock'
import type { CallLogSeed } from './types'

const SPLASH_SEEN_KEY = 'aica-splash-seen'

function App() {
  const [activeNavId, setActiveNavId] = useState('dashboard')
  const [callLogSeed, setCallLogSeed] = useState<CallLogSeed | undefined>()
  // Boot splash, once per tab — never on in-app navigation, which never
  // reloads this component anyway. sessionStorage clears the flag on close.
  const [showSplash, setShowSplash] = useState(
    () => sessionStorage.getItem(SPLASH_SEEN_KEY) !== '1',
  )
  const activeLabel =
    [...primaryNav, ...footerNav, ...supportNav].find((n) => n.id === activeNavId)
      ?.label ?? 'Dashboard'

  // The one navigation entry point — used by the sidebar (plain id) and by
  // dashboard drill-downs (id + which Call Log rows to land on). Routing
  // anywhere but Call Log always clears a stale seed from an earlier click.
  function navigate(id: string, seed?: CallLogSeed) {
    setActiveNavId(id)
    setCallLogSeed(id === 'call-log' ? seed : undefined)
  }

  return (
    <>
      {showSplash && (
        <LoadingScreen
          onDone={() => {
            sessionStorage.setItem(SPLASH_SEEN_KEY, '1')
            setShowSplash(false)
          }}
        />
      )}
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
    </>
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
      return <AgentBuilderPage onNavigate={onNavigate} />
    case 'simulation':
      return <SimulationPage />
    case 'improvement-feed':
      return <ImprovementFeedPage />
    case 'budget':
      return <BudgetPage />
    case 'integrations':
      return <IntegrationsPage />
    case 'settings':
      return <SettingsPage />
    case 'help':
      return <HelpContactPage />
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
