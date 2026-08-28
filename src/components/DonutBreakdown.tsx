const SIZE = 80
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export interface DonutSegment {
  label: string
  value: number
  colorClassName: string
}

/** A real multi-segment donut — each slice is an actual category behind the
 * headline percent (call outcomes, sim results), not a single hue-on-itself
 * ring. Renders at final value instantly, no page-load sweep. */
export function DonutBreakdown({
  segments,
  centerLabel,
  ariaLabel,
}: {
  segments: DonutSegment[]
  centerLabel: string
  ariaLabel: string
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  const center = SIZE / 2
  let cumulative = 0

  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={ariaLabel}>
      <circle
        cx={center}
        cy={center}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className="text-hairline"
        stroke="currentColor"
      />
      {total > 0 &&
        segments
          .filter((s) => s.value > 0)
          .map((seg) => {
            const len = (seg.value / total) * CIRCUMFERENCE
            const offset = cumulative
            cumulative += len
            return (
              <circle
                key={seg.label}
                cx={center}
                cy={center}
                r={RADIUS}
                fill="none"
                strokeWidth={STROKE}
                strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
                strokeDashoffset={-offset}
                transform={`rotate(-90 ${center} ${center})`}
                className={seg.colorClassName}
                stroke="currentColor"
              />
            )
          })}
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-body font-display text-[17px]"
      >
        {centerLabel}
      </text>
    </svg>
  )
}

/** The compact colored-dot legend paired with a DonutBreakdown — turns the
 * ring's colors into named, countable categories. */
export function DonutLegend({ segments }: { segments: DonutSegment[] }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
      {segments.map((seg) => (
        <li key={seg.label} className="flex items-center gap-1.5 text-[11px] text-muted">
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${seg.colorClassName}`}
            style={{ backgroundColor: 'currentColor' }}
            aria-hidden="true"
          />
          {seg.label} <span className="font-mono text-faint">{seg.value}</span>
        </li>
      ))}
    </ul>
  )
}
