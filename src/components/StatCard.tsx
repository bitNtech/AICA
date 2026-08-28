import type { StatSeries } from '../types'
import { BarSparkline } from './BarSparkline'
import { ArrowDownRightIcon, ArrowUpRightIcon, CallLogIcon, ChevronRightIcon, MinusIcon } from './icons'

const TREND_COLOR: Record<StatSeries['trend'], string> = {
  up: 'text-sage',
  down: 'text-critical',
  flat: 'text-muted',
}

const TREND_ICON: Record<StatSeries['trend'], typeof ArrowUpRightIcon> = {
  up: ArrowUpRightIcon,
  down: ArrowDownRightIcon,
  flat: MinusIcon,
}

/** A `count`-format KPI card — headline number, delta, and a bar sparkline.
 * The `percent` KPIs get their own full-size DonutChartCard instead of a
 * cramped in-card ring. */
export function StatCard({
  stat,
  onOpen,
}: {
  stat: StatSeries
  /** Clicking the card drills into the records behind this metric. */
  onOpen?: () => void
}) {
  const TrendIcon = TREND_ICON[stat.trend]

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="card-interactive group/stat flex w-full flex-col p-5 text-left disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-sm"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
          <CallLogIcon className="h-4 w-4" />
        </span>
        <p className="truncate text-sm font-medium text-muted">{stat.label}</p>
      </div>

      <p className="mt-3 font-display text-3xl font-normal tabular-nums text-body">{stat.value}</p>

      {stat.delta && (
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${TREND_COLOR[stat.trend]}`}
        >
          <TrendIcon className="h-3 w-3" />
          {stat.delta}
        </p>
      )}

      <div className="mt-4">
        <BarSparkline series={stat.series} />
      </div>

      {onOpen && (
        <span className="mt-3 flex items-center gap-0.5 text-xs font-medium text-faint opacity-0 transition-opacity duration-150 group-hover/stat:opacity-100 group-hover/stat:text-pulse">
          View details
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}
