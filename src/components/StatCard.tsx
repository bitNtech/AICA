import type { StatSeries } from '../types'
import { DonutMeter } from './DonutMeter'
import { BarSparkline } from './BarSparkline'
import {
  ArrowDownRightIcon,
  ArrowUpRightIcon,
  CallLogIcon,
  DataReadinessIcon,
  MinusIcon,
  RolloutIcon,
} from './icons'

const TREND_COLOR: Record<StatSeries['trend'], string> = {
  up: 'text-sage',
  down: 'text-pulse',
  flat: 'text-muted',
}

const TREND_ICON: Record<StatSeries['trend'], typeof ArrowUpRightIcon> = {
  up: ArrowUpRightIcon,
  down: ArrowDownRightIcon,
  flat: MinusIcon,
}

const STAT_ICON: Record<string, typeof CallLogIcon> = {
  'calls-answered': CallLogIcon,
  'resolved-no-redirect': RolloutIcon,
  'matched-human': DataReadinessIcon,
}

export function StatCard({ stat }: { stat: StatSeries }) {
  const TrendIcon = TREND_ICON[stat.trend]
  const Icon = STAT_ICON[stat.id] ?? CallLogIcon

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted">{stat.label}</p>
          {stat.format === 'count' ? (
            <p className="mt-2 font-display text-2xl font-normal text-body">
              {stat.value}
            </p>
          ) : null}
          {stat.delta && (
            <p
              className={`mt-1 flex items-center gap-1 text-xs font-medium ${TREND_COLOR[stat.trend]}`}
            >
              <TrendIcon className="h-3 w-3" />
              {stat.delta}
            </p>
          )}
        </div>
        {stat.format === 'percent' ? (
          <DonutMeter value={stat.numericValue} label={stat.label} />
        ) : (
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-canvas text-muted">
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      {stat.format === 'count' && (
        <div className="mt-4">
          <BarSparkline series={stat.series} />
        </div>
      )}
    </div>
  )
}
