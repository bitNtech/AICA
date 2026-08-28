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
  'resolved-no-redirect': RolloutIcon,
  'matched-human': DataReadinessIcon,
}

export function StatCard({ stat }: { stat: StatSeries }) {
  const TrendIcon = TREND_ICON[stat.trend]
  const Icon = STAT_ICON[stat.id] ?? CallLogIcon
  const diff = stat.target !== undefined ? Math.round(stat.numericValue - stat.target) : null
  const onTarget = diff === null || diff >= 0

  return (
    <div className="card-interactive p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
            <Icon className="h-4 w-4" />
          </span>
          <p className="truncate text-sm font-medium text-muted">{stat.label}</p>
        </div>
        {stat.format === 'percent' && (
          <DonutMeter
            value={stat.numericValue}
            label={stat.label}
            target={stat.target}
            colorClassName={onTarget ? 'text-sage' : 'text-amber'}
            trackClassName={onTarget ? 'text-sage/15' : 'text-amber/15'}
          />
        )}
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

      {stat.format === 'count' && (
        <div className="mt-4">
          <BarSparkline series={stat.series} />
        </div>
      )}
    </div>
  )
}
