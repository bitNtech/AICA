import type { SimulationRun } from '../types'

const SIZE = 56
const STROKE = 6
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** The single most important trust-building screen in the product: the
 * thing that makes "91% matched human" honest instead of marketing, by
 * showing exactly how much of that score a person actually checked. */
export function JudgeCalibrationPanel({ run }: { run: SimulationRun }) {
  const agreementRate = Math.round((run.humanAgreedCount / run.humanAuditedCount) * 100)
  const dash = (agreementRate / 100) * CIRCUMFERENCE

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5">
      <p className="text-sm font-medium text-body">Judge calibration</p>
      <p className="mt-3 text-sm text-body">
        {run.humanAuditedCount} of these {run.totalCalls} scores were checked
        by a person —{' '}
        <span className="font-semibold text-sage">
          {run.humanAgreedCount} agreed
        </span>{' '}
        with the automated judge.
      </p>

      <div className="mt-4 flex items-center gap-4 border-t border-hairline pt-4">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Judge agreement rate">
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" strokeWidth={STROKE} className="text-sage/15" stroke="currentColor" />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            className="text-sage"
            stroke="currentColor"
          />
          <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" className="fill-body font-display text-[13px]">
            {agreementRate}%
          </text>
        </svg>
        <p className="text-xs text-muted">
          Agreement rate between the automated judge and a human reviewer on
          the audited sample. A low rate here would mean the automated score
          can't be trusted — this is that check, done in the open.
        </p>
      </div>
    </div>
  )
}
