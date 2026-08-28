import type { StatSeries } from '../types'
import { DonutMeter } from './DonutMeter'
import { DonutBreakdown, DonutLegend, type DonutSegment } from './DonutBreakdown'
import { BarSparkline } from './BarSparkline'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CallLogIcon,
  CheckIcon,
  ChevronRightIcon,
  DataReadinessIcon,
  MinusIcon,
} from './icons'

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

const STAT_ICON: Record<string, typeof CallLogIcon> = {
  'calls-answered': CallLogIcon,
  'resolved-no-redirect': CheckIcon,
  'matched-human': DataReadinessIcon,
}

export function StatCard({
  stat,
  breakdown,
  onOpen,
}: {
  stat: StatSeries
  /** `percent` format only — the real categories behind the headline number,
   * rendered as a colored-segment donut instead of a single-hue ring. */
  breakdown?: DonutSegment[]
  /** Clicking the card drills into the records behind this metric. */
  onOpen?: () => void
}) {
  const TrendIcon = TREND_ICON[stat.trend]
  const Icon = STAT_ICON[stat.id] ?? CallLogIcon
  const diff = stat.target !== undefined ? Math.round(stat.numericValue - stat.target) : null
  const onTarget = diff === null || diff >= 0

  return (
    <button
      type="button"
      onClick={onOpen}
      disabled={!onOpen}
      className="card-interactive group/stat flex w-full flex-col p-5 text-left disabled:cursor-default disabled:hover:translate-y-0 disabled:hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
            <Icon className="h-4 w-4" />
          </span>
          <p className="truncate text-sm font-medium text-muted">{stat.label}</p>
        </div>
        {stat.format === 'percent' &&
          (breakdown && breakdown.length > 1 ? (
            <DonutBreakdown
              segments={breakdown}
              centerLabel={stat.value}
              ariaLabel={`${stat.label} — ${stat.value}, broken down by ${breakdown.map((s) => s.label).join(', ')}`}
            />
          ) : (
            <DonutMeter
              value={stat.numericValue}
              label={stat.label}
              target={stat.target}
              colorClassName={onTarget ? 'text-sage' : 'text-amber'}
              trackClassName={onTarget ? 'text-sage/15' : 'text-amber/15'}
            />
          ))}
      </div>

      {stat.format === 'count' && (
        <p className="mt-3 font-display text-3xl font-normal tabular-nums text-body">
          {stat.value}
        </p>
      )}

      {stat.delta && (
        <p
          className={`mt-1.5 flex items-center gap-1 text-xs font-medium ${TREND_COLOR[stat.trend]}`}
        >
          <TrendIcon className="h-3 w-3" />
          {stat.delta}
        </p>
      )}

      {stat.format === 'percent' && stat.target !== undefined && (
        <p className="mt-1 text-xs text-faint">
          Target {stat.target}%{' '}
          <span className={onTarget ? 'text-sage' : 'text-amber'}>
            · {onTarget ? 'Above target' : 'Below target'}
          </span>
        </p>
      )}

      {stat.format === 'percent' && breakdown && breakdown.length > 1 && (
        <DonutLegend segments={breakdown} />
      )}

      {stat.format === 'count' && (
        <div className="mt-4">
          <BarSparkline series={stat.series} />
        </div>
      )}

      {onOpen && (
        <span className="mt-3 flex items-center gap-0.5 text-xs font-medium text-faint opacity-0 transition-opacity duration-150 group-hover/stat:opacity-100 group-hover/stat:text-pulse">
          View details
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  )
}
