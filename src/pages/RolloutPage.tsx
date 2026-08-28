import { useState } from 'react'
import { mockIntentThresholds, mockRollout } from '../data/mock'
import { RolloutIcon } from '../components/icons'

export function RolloutPage() {
  const [stageIndex, setStageIndex] = useState(mockRollout.currentStageIndex)
  const [thresholds, setThresholds] = useState(mockIntentThresholds)
  const [justRolledBack, setJustRolledBack] = useState(false)

  const stage = mockRollout.stages[stageIndex]
  const rate = mockRollout.matchedHumanRateByStage[stage]

  function rollback() {
    setStageIndex(0)
    setJustRolledBack(true)
    setTimeout(() => setJustRolledBack(false), 3000)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-body">Staged rollout</p>
            <p className="mt-1 text-xs text-muted">
              How much of your call volume AICA handles live, ramped in
              stages.
            </p>
          </div>
          <button
            type="button"
            onClick={rollback}
            disabled={stageIndex === 0}
            className="btn-secondary shrink-0 !border-critical/35 !text-critical hover:!bg-critical/[0.08]"
          >
            <RolloutIcon className="h-4 w-4 rotate-180" />
            Roll back to 0%
          </button>
        </div>

        {justRolledBack && (
          <p className="mt-3 flex items-center gap-2 rounded-lg bg-sage/10 px-3 py-2 text-sm font-medium text-sage">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            Rolled back — AICA is no longer taking live calls under this
            config.
          </p>
        )}

        <div className="mt-5 flex items-center gap-2">
          {mockRollout.stages.map((s, i) => (
            <div key={s} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setStageIndex(i)}
                className={`flex h-11 flex-1 items-center justify-center rounded-xl border text-sm font-semibold transition-colors duration-150 ${
                  i === stageIndex
                    ? 'border-pulse bg-pulse text-ink-teal shadow-sm'
                    : i < stageIndex
                      ? 'border-sage/40 bg-sage/10 text-sage'
                      : 'border-hairline bg-canvas text-muted hover:bg-surface-hover hover:text-body'
                }`}
              >
                {s}%
              </button>
              {i < mockRollout.stages.length - 1 && (
                <div className={`h-px w-3 shrink-0 ${i < stageIndex ? 'bg-sage/40' : 'bg-hairline'}`} />
              )}
            </div>
          ))}
        </div>

        <div className="mt-4 rounded-xl bg-canvas px-4 py-3">
          {rate !== null ? (
            <p className="text-sm text-body">
              At <span className="font-semibold">{stage}%</span>, AICA is
              matching or beating human front-desk responses{' '}
              <span className="font-semibold text-sage">{rate}%</span> of the
              time — the number to watch before advancing.
            </p>
          ) : (
            <p className="text-sm text-muted">
              No live traffic at {stage}% yet — advance the stage to start
              collecting a matched-human rate here.
            </p>
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
        <p className="text-sm font-medium text-body">
          Hand off when the agent isn't sure
        </p>
        <p className="mt-1 text-xs text-muted">
          Below this confidence, a call routes to staff instead of AICA
          answering on its own — set per intent.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {thresholds.map((t, i) => (
            <div key={t.intent} className="flex items-center gap-4">
              <span className="w-44 shrink-0 text-sm text-body">{t.intent}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(t.floor * 100)}
                onChange={(e) => {
                  const next = [...thresholds]
                  next[i] = { ...t, floor: Number(e.target.value) / 100 }
                  setThresholds(next)
                }}
                disabled={t.floor === 1}
                className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-hairline accent-pulse disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span className="w-12 shrink-0 text-right font-mono text-sm text-muted">
                {Math.round(t.floor * 100)}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
