import { useCallback, useState } from 'react'
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom'
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
import { callLogSeedToSearchParams, pathToNavId } from './lib/routing'
import type { CallLogSeed } from './types'

const SPLASH_SEEN_KEY = 'aica-splash-seen'
const ALL_NAV = [...primaryNav, ...footerNav, ...supportNav]

function App() {
  const location = useLocation()
  const navigate = useNavigate()
  // Boot splash, once per tab — never on in-app navigation, which never
  // reloads this component anyway. sessionStorage clears the flag on close.
  const [showSplash, setShowSplash] = useState(
    () => sessionStorage.getItem(SPLASH_SEEN_KEY) !== '1',
  )

  const activeNavId = pathToNavId(location.pathname)
  const activeLabel = ALL_NAV.find((n) => n.id === activeNavId)?.label ?? 'Dashboard'

  // The one navigation entry point — used by the sidebar (plain id) and by
  // dashboard drill-downs (id + which Call Log rows to land on). Call Log's
  // seed travels as query params so a drill-down survives a refresh.
  const goTo = useCallback(
    (id: string, seed?: CallLogSeed) => {
      const item = ALL_NAV.find((n) => n.id === id)
      const path = item?.href ?? '/'
      if (id === 'call-log' && seed) {
        const params = callLogSeedToSearchParams(seed)
        navigate(params.size > 0 ? `${path}?${params}` : path)
      } else {
        navigate(path)
      }
    },
    [navigate],
  )

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
      <AppShell title={activeLabel} activeNavId={activeNavId} onNavSelect={goTo}>
        <Routes>
          <Route path="/" element={<Dashboard onNavigate={goTo} />} />
          <Route path="/call-log" element={<CallLogPage />} />
          <Route path="/knowledge-base" element={<KnowledgeBasePage />} />
          <Route path="/agent-builder" element={<AgentBuilderPage onNavigate={goTo} />} />
          <Route path="/simulation" element={<SimulationPage />} />
          <Route path="/improvement-feed" element={<ImprovementFeedPage />} />
          <Route path="/budget" element={<BudgetPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/help" element={<HelpContactPage />} />
          <Route
            path="*"
            element={
              <EmptyState
                title="Page not found"
                description="This screen doesn't exist yet — the app shell, Pulse Line, and mock data underneath it are already wired up."
                actionLabel="Back to Dashboard"
                onAction={() => goTo('dashboard')}
              />
            }
          />
        </Routes>
      </AppShell>
    </>
  )
}

export default App
