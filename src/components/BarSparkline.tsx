import { Tooltip } from './Tooltip'

const HEIGHT = 40
const GAP = 2

/** A compact column chart: history in the de-emphasis tone, today in the
 * accent — replaces a line sparkline with true magnitude bars, per the
 * mark spec (rounded data-end, square baseline, 2px surface gap). */
export function BarSparkline({
  series,
  accentClassName = 'text-pulse',
  mutedClassName = 'text-muted/35',
}: {
  series: { label: string; value: number }[]
  accentClassName?: string
  mutedClassName?: string
}) {
  if (series.length === 0) return null
  const max = Math.max(...series.map((d) => d.value))

  return (
    <div className="flex items-end" style={{ height: HEIGHT, gap: GAP }}>
      {series.map((point, i) => {
        const isLast = i === series.length - 1
        const h = max === 0 ? 2 : Math.max(3, (point.value / max) * HEIGHT)
        return (
          <Tooltip
            key={point.label}
            className="flex-1 items-end"
            content={`${point.label} · ${point.value}`}
          >
            <div
              tabIndex={0}
              className={`w-full rounded-t-[3px] outline-none ${isLast ? accentClassName : mutedClassName}`}
              style={{ height: h, backgroundColor: 'currentColor' }}
            />
          </Tooltip>
        )
      })}
    </div>
  )
}
