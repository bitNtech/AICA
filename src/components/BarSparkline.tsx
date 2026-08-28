import { Tooltip } from './Tooltip'

const HEIGHT = 64
const GAP = 4

type ConfidenceTier = 'high' | 'review' | 'low'

const TIER_COLOR: Record<ConfidenceTier, string> = {
  high: 'text-sage',
  review: 'text-amber',
  low: 'text-critical',
}

const TIER_LABEL: Record<ConfidenceTier, string> = {
  high: 'High confidence',
  review: 'Needs review',
  low: 'Low confidence',
}

const TIERS: ConfidenceTier[] = ['high', 'review', 'low']

/** A stacked column chart: each day's bar splits into its confidence-tier
 * mix (high/review/low), so the chart shows composition, not just volume.
 * Today's bar renders at full opacity, history dimmed — replaces the old
 * single-hue sparkline per the mark spec (rounded data-end, square
 * baseline, 2px surface gap). */
export function BarSparkline({
  series,
}: {
  series: { label: string; value: number; byConfidence: Record<ConfidenceTier, number> }[]
}) {
  if (series.length === 0) return null
  const max = Math.max(...series.map((d) => d.value))

  return (
    <div>
      <div className="flex items-end" style={{ height: HEIGHT, gap: GAP }}>
        {series.map((point, i) => {
          const isLast = i === series.length - 1
          const barHeight = max === 0 ? 2 : Math.max(4, (point.value / max) * HEIGHT)
          const tooltip = `${point.label} · ${point.value} calls (${point.byConfidence.high} high · ${point.byConfidence.review} review · ${point.byConfidence.low} low)`

          return (
            <Tooltip key={point.label} className="flex-1 items-end" content={tooltip}>
              <div
                tabIndex={0}
                className="flex w-full flex-col-reverse overflow-hidden rounded-t-[3px] outline-none"
                style={{ height: barHeight }}
              >
                {TIERS.map((tier) => {
                  const count = point.byConfidence[tier]
                  if (count <= 0) return null
                  const segHeight = (count / point.value) * barHeight
                  return (
                    <div
                      key={tier}
                      className={TIER_COLOR[tier]}
                      style={{
                        height: segHeight,
                        backgroundColor: 'currentColor',
                        opacity: isLast ? 1 : 0.55,
                      }}
                    />
                  )
                })}
              </div>
            </Tooltip>
          )
        })}
      </div>
      <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
        {TIERS.map((tier) => (
          <li key={tier} className="flex items-center gap-1.5 text-[11px] text-muted">
            <span
              className={`h-1.5 w-1.5 shrink-0 rounded-full ${TIER_COLOR[tier]}`}
              style={{ backgroundColor: 'currentColor' }}
              aria-hidden="true"
            />
            {TIER_LABEL[tier]}
          </li>
        ))}
      </ul>
    </div>
  )
}
