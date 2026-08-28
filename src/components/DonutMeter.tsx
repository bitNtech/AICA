const SIZE = 80
const STROKE = 8
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A ratio-against-100 meter, drawn as a ring: an accent-colored arc over a
 * lighter step of the same hue (never two arbitrary colors) — reads as a
 * pie/donut at a glance while still following meter semantics. An optional
 * `target` renders as a small tick on the track, so "here" and "the goal"
 * read in one glance. Renders at its final value instantly, no page-load
 * sweep, per the console-grade motion principle. */
export function DonutMeter({
  value,
  label,
  target,
  colorClassName = 'text-sage',
  trackClassName = 'text-sage/15',
}: {
  value: number
  label: string
  target?: number
  colorClassName?: string
  trackClassName?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const dash = (clamped / 100) * CIRCUMFERENCE
  const center = SIZE / 2
  const targetAngle =
    target !== undefined ? (Math.max(0, Math.min(100, target)) / 100) * 360 - 90 : null

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={target !== undefined ? `${label} — target ${target}%` : label}
    >
      <circle
        cx={center}
        cy={center}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className={trackClassName}
        stroke="currentColor"
      />
      {targetAngle !== null && (
        <line
          x1={center + Math.cos((targetAngle * Math.PI) / 180) * (RADIUS - STROKE / 2 - 1)}
          y1={center + Math.sin((targetAngle * Math.PI) / 180) * (RADIUS - STROKE / 2 - 1)}
          x2={center + Math.cos((targetAngle * Math.PI) / 180) * (RADIUS + STROKE / 2 + 1)}
          y2={center + Math.sin((targetAngle * Math.PI) / 180) * (RADIUS + STROKE / 2 + 1)}
          className="text-body/70"
          stroke="currentColor"
          strokeWidth={1.75}
        />
      )}
      <circle
        cx={center}
        cy={center}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        transform={`rotate(-90 ${center} ${center})`}
        className={colorClassName}
        stroke="currentColor"
      />
      <text
        x="50%"
        y="53%"
        textAnchor="middle"
        dominantBaseline="middle"
        className="fill-body font-display text-[19px]"
      >
        {Math.round(clamped)}%
      </text>
    </svg>
  )
}
