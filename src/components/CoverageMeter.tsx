const SIZE = 64
const STROKE = 7
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** Persistent header on Agent Builder: "% of your call history this agent
 * can currently handle" — one of the product's real differentiators, so it
 * never hides in a settings tab. */
export function CoverageMeter({
  percent,
  handledCalls,
  totalCalls,
  gaps,
}: {
  percent: number
  handledCalls: number
  totalCalls: number
  gaps: { label: string; callsPerWeek: number }[]
}) {
  const dash = (percent / 100) * CIRCUMFERENCE

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-5">
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label="Coverage">
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
          <text x="50%" y="53%" textAnchor="middle" dominantBaseline="middle" className="fill-body font-display text-[15px]">
            {percent}%
          </text>
        </svg>
        <div>
          <p className="text-sm font-medium text-body">
            Coverage — the share of your call history this agent can
            currently handle
          </p>
          <p className="mt-1 text-xs text-muted">
            {handledCalls.toLocaleString()} of {totalCalls.toLocaleString()}{' '}
            historical calls fall inside a covered path.
          </p>
        </div>
      </div>

      {gaps.length > 0 && (
        <div className="mt-4 border-t border-hairline pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Not yet covered
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {gaps.map((gap) => (
              <li key={gap.label} className="flex items-center justify-between text-sm">
                <span className="text-body">{gap.label}</span>
                <span className="font-mono text-xs text-muted">
                  ~{gap.callsPerWeek}/wk
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
