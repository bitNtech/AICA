import { useState } from 'react'
import { AppShell } from './shell/AppShell'
import { EmptyState } from './components/EmptyState'
import { Dashboard } from './pages/Dashboard'
import { LiveCallsPage } from './pages/LiveCallsPage'
import { CallLogPage } from './pages/CallLogPage'
import { primaryNav } from './data/mock'

function App() {
  const [activeNavId, setActiveNavId] = useState('dashboard')
  const activeLabel =
    primaryNav.find((n) => n.id === activeNavId)?.label ?? 'Dashboard'

  return (
    <AppShell
      title={activeLabel}
      activeNavId={activeNavId}
      onNavSelect={setActiveNavId}
    >
      <Page id={activeNavId} label={activeLabel} onBack={() => setActiveNavId('dashboard')} />
    </AppShell>
  )
}

function Page({
  id,
  label,
  onBack,
}: {
  id: string
  label: string
  onBack: () => void
}) {
  switch (id) {
    case 'dashboard':
      return <Dashboard />
    case 'live-calls':
      return <LiveCallsPage />
    case 'call-log':
      return <CallLogPage />
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
