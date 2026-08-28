const SIZE = 76
const STROKE = 9
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

/** A ratio-against-100 meter, drawn as a ring: an accent-colored arc over a
 * lighter step of the same hue (never two arbitrary colors) — reads as a
 * pie/donut at a glance while still following meter semantics. Renders at
 * its final value instantly, no page-load sweep, per the console-grade
 * motion principle. */
export function DonutMeter({
  value,
  label,
  colorClassName = 'text-sage',
  trackClassName = 'text-sage/15',
}: {
  value: number
  label: string
  colorClassName?: string
  trackClassName?: string
}) {
  const clamped = Math.max(0, Math.min(100, value))
  const dash = (clamped / 100) * CIRCUMFERENCE

  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      role="img"
      aria-label={label}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        className={trackClassName}
        stroke="currentColor"
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={RADIUS}
        fill="none"
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
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
