import { useMemo, useState } from 'react'
import { mockSimulationCalls, mockSimulationRun } from '../data/mock'
import { SimResultBadge } from '../components/SimResultBadge'
import { SimResultsBar } from '../components/SimResultsBar'
import { JudgeCalibrationPanel } from '../components/JudgeCalibrationPanel'
import { SimulationCallCompare } from '../components/SimulationCallCompare'
import { Toggle } from '../components/Toggle'
import { PulseLine } from '../components/PulseLine'
import { useUiStore } from '../store/ui'
import type { SimResult, SimulationCall } from '../types'

const RESULT_FILTERS: { value: 'all' | SimResult; label: string }[] = [
  { value: 'all', label: 'All results' },
  { value: 'beat', label: 'Beat human' },
  { value: 'matched', label: 'Matched human' },
  { value: 'worse', label: 'Worse than human' },
]

export function SimulationPage() {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const [running, setRunning] = useState(false)
  const [ghostMode, setGhostMode] = useState(false)
  const [resultFilter, setResultFilter] = useState<'all' | SimResult>('all')
  const [lastRanAt, setLastRanAt] = useState(mockSimulationRun.ranAt)
  const [runCount, setRunCount] = useState(0)

  function runSimulation() {
    setRunning(true)
    setTimeout(() => {
      setRunning(false)
      setLastRanAt(new Date().toISOString())
      setRunCount((n) => n + 1)
    }, 1400)
  }

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

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <div>
          <p className="text-sm font-medium text-body">{mockSimulationRun.configLabel}</p>
          <p className="mt-0.5 text-xs text-muted">
            Last run {new Date(lastRanAt).toLocaleString()} · {mockSimulationRun.totalCalls}{' '}
            historical calls replayed
            {runCount > 0 && ` · run ${runCount} time${runCount === 1 ? '' : 's'} this session`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2">
            <Toggle checked={ghostMode} onChange={setGhostMode} label="Ghost mode" />
            <span className="text-sm text-body">Ghost mode</span>
          </label>
          <button type="button" onClick={runSimulation} disabled={running} className="btn-primary !px-5">
            {running ? 'Running…' : 'Run simulation'}
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

      {running ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-hairline bg-surface p-10 shadow-sm">
          <PulseLine mode="idle" height={32} className="w-48 text-pulse" aria-label="Running simulation" />
          <p className="text-sm text-muted">Replaying calls against the current config…</p>
        </div>
      ) : (
        <>
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
              <table className="w-full text-left text-sm">
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
          )}
        </>
      )}
    </div>
  )
}
