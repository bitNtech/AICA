import { useMemo, useState } from 'react'
import { mockSimulationCalls, mockSimulationRun } from '../data/mock'
import { SimResultBadge } from '../components/SimResultBadge'
import { SimResultsBar } from '../components/SimResultsBar'
import { JudgeCalibrationPanel } from '../components/JudgeCalibrationPanel'
import { SimulationCallCompare } from '../components/SimulationCallCompare'
import { DirectTestingPanel } from '../components/DirectTestingPanel'
import { ErrorBoundary } from '../components/ErrorBoundary'
import { Toggle } from '../components/Toggle'
import { useUiStore } from '../store/ui'
import { useAgentConfigStore } from '../store/agentConfig'
import type { SimResult, SimulationCall } from '../types'

const RESULT_FILTERS: { value: 'all' | SimResult; label: string }[] = [
  { value: 'all', label: 'All results' },
  { value: 'beat', label: 'Beat human' },
  { value: 'matched', label: 'Matched human' },
  { value: 'worse', label: 'Worse than human' },
]

export function SimulationPage() {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const additionalContext = useAgentConfigStore((s) => s.additionalContext)
  const [testingOpen, setTestingOpen] = useState(false)
  const [ghostMode, setGhostMode] = useState(false)
  const [resultFilter, setResultFilter] = useState<'all' | SimResult>('all')

  function openCall(call: SimulationCall) {
    openDrawer({
      title: call.intent,
      subtitle: 'Replayed against the current config',
      body: <SimulationCallCompare call={call} />,
    })
  }

  const visibleCalls = useMemo(() => {
    return mockSimulationCalls.filter((c) => {
      if (!ghostMode && c.ghost) return false
      if (resultFilter !== 'all' && c.result !== resultFilter) return false
      return true
    })
  }, [ghostMode, resultFilter])

  if (testingOpen) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4">
        <ErrorBoundary
          fallback={(retry) => (
            <div className="card flex h-full min-h-0 flex-col items-center justify-center gap-3 p-8 text-center">
              <p className="text-sm font-medium text-body">The test call panel hit an error.</p>
              <div className="flex gap-2">
                <button type="button" onClick={retry} className="btn-ghost !px-4 !py-1.5 text-xs">
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => setTestingOpen(false)}
                  className="btn-ghost !px-4 !py-1.5 text-xs"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        >
          <DirectTestingPanel onClose={() => setTestingOpen(false)} />
        </ErrorBoundary>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <div>
          <p className="text-sm font-medium text-body">{mockSimulationRun.configLabel}</p>
          <p className="mt-0.5 text-xs text-muted">
            Last run {new Date(mockSimulationRun.ranAt).toLocaleString()} · {mockSimulationRun.totalCalls}{' '}
            historical calls replayed
            {additionalContext.length > 0 &&
              ` · ${additionalContext.length} additional context doc${additionalContext.length === 1 ? '' : 's'} attached`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <Toggle checked={ghostMode} onChange={setGhostMode} label="Ghost mode" />
            <span className="text-sm text-body">Ghost mode</span>
          </label>
          <button
            type="button"
            onClick={() => setTestingOpen(true)}
            className="btn-primary !px-5 shadow-md saturate-150 hover:shadow-lg"
          >
            Run simulation
          </button>
        </div>
      </div>

      {ghostMode && (
        <p className="flex items-center gap-2 text-xs text-muted">
          <span className="h-1.5 w-1.5 rounded-full bg-sage" />
          Ghost mode is on — this config is running silently alongside the
          live agent. Nothing it says reaches a real caller.
        </p>
      )}

      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <p className="text-sm font-medium text-body">Results</p>
        <div className="mt-4">
          <SimResultsBar run={mockSimulationRun} />
        </div>
      </div>

      <JudgeCalibrationPanel run={mockSimulationRun} />

      <div className="flex items-center justify-between gap-3">
        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value as 'all' | SimResult)}
          className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
        >
          {RESULT_FILTERS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="font-mono text-xs text-faint">
          {visibleCalls.length} {visibleCalls.length === 1 ? 'call' : 'calls'}
        </p>
      </div>

      {visibleCalls.length === 0 ? (
        <div className="card px-5 py-6 text-center text-sm text-muted">
          No replayed calls match this filter.
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-hairline text-xs text-muted">
                  <th className="px-4 py-3 font-medium">Intent</th>
                  <th className="px-4 py-3 font-medium">Result</th>
                  <th className="px-4 py-3 font-medium">Tag</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-hairline">
                {visibleCalls.map((call) => (
                  <tr
                    key={call.id}
                    onClick={() => openCall(call)}
                    className="cursor-pointer hover:bg-surface-hover"
                  >
                    <td className="px-4 py-3 text-body">{call.intent}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <SimResultBadge result={call.result} />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {call.ghost && (
                        <span className="rounded-full bg-canvas px-2 py-0.5 text-xs font-medium text-muted">
                          Ghost
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
