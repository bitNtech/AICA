import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDownRightIcon, ArrowUpRightIcon, ChevronRightIcon, MinusIcon } from './icons'

const SIZE = 148
const STROKE = 16
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS
const CENTER = SIZE / 2

export interface DonutSegment {
  label: string
  value: number
  colorClassName: string
}

interface HoverState {
  segment: DonutSegment
  percent: number
  x: number
  y: number
}

/** A full-size, standalone breakdown chart — every category behind a percent
 * KPI gets its own card with room for the real title, a legend that never
 * truncates, and a cursor-following tooltip on every segment (mouse or
 * keyboard focus) instead of the cramped in-card ring. */
export function DonutChartCard({
  title,
  icon,
  segments,
  centerLabel,
  value,
  target,
  delta,
  trend,
  onOpen,
}: {
  title: string
  icon: ReactNode
  segments: DonutSegment[]
  centerLabel: string
  /** The headline percent as a number, for the target comparison below. */
  value: number
  target?: number
  delta?: string
  trend?: 'up' | 'down' | 'flat'
  onOpen?: () => void
}) {
  const [hover, setHover] = useState<HoverState | null>(null)
  const chartRef = useRef<HTMLDivElement>(null)
  const total = segments.reduce((sum, s) => sum + s.value, 0)
  let cumulative = 0

  function showAt(clientX: number, clientY: number, seg: DonutSegment) {
    const rect = chartRef.current?.getBoundingClientRect()
    if (!rect) return
    setHover({
      segment: seg,
      percent: total > 0 ? Math.round((seg.value / total) * 100) : 0,
      x: clientX - rect.left,
      y: clientY - rect.top,
    })
  }

  function showCentered(seg: DonutSegment) {
    setHover({
      segment: seg,
      percent: total > 0 ? Math.round((seg.value / total) * 100) : 0,
      x: CENTER,
      y: CENTER,
    })
  }

  const TrendIcon = trend === 'up' ? ArrowUpRightIcon : trend === 'down' ? ArrowDownRightIcon : MinusIcon
  const trendColor = trend === 'up' ? 'text-sage' : trend === 'down' ? 'text-critical' : 'text-muted'
  const onTarget = target === undefined || value >= target

  return (
    <div
      onClick={onOpen}
      role={onOpen ? 'button' : undefined}
      tabIndex={onOpen ? 0 : undefined}
      onKeyDown={(e) => {
        if (onOpen && (e.key === 'Enter' || e.key === ' ')) onOpen()
      }}
      className={`card flex flex-col p-5 ${
        onOpen ? 'card-interactive group/donut cursor-pointer' : ''
      }`}
    >
      <div className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
          {icon}
        </span>
        <p className="text-sm font-medium text-body">{title}</p>
      </div>

      <div
        ref={chartRef}
        className="relative mx-auto mt-4 flex items-center justify-center"
        style={{ width: SIZE, height: SIZE }}
        onMouseLeave={() => setHover(null)}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${title} — ${centerLabel}`}>
          <circle
            cx={CENTER}
            cy={CENTER}
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
                const isHover = hover?.segment.label === seg.label
                return (
                  <circle
                    key={seg.label}
                    cx={CENTER}
                    cy={CENTER}
                    r={RADIUS}
                    fill="none"
                    strokeWidth={isHover ? STROKE + 4 : STROKE}
                    strokeDasharray={`${len} ${CIRCUMFERENCE - len}`}
                    strokeDashoffset={-offset}
                    transform={`rotate(-90 ${CENTER} ${CENTER})`}
                    className={`${seg.colorClassName} cursor-pointer transition-[stroke-width] duration-100`}
                    stroke="currentColor"
                    tabIndex={0}
                    onMouseEnter={(e) => showAt(e.clientX, e.clientY, seg)}
                    onMouseMove={(e) => showAt(e.clientX, e.clientY, seg)}
                    onFocus={() => showCentered(seg)}
                    onBlur={() => setHover(null)}
                  />
                )
              })}
          <text
            x="50%"
            y="53%"
            textAnchor="middle"
            dominantBaseline="middle"
            className="fill-body font-display text-2xl"
          >
            {centerLabel}
          </text>
        </svg>

        {hover && (
          <div
            className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] whitespace-nowrap rounded-lg bg-ink-teal px-2.5 py-1.5 text-xs text-mist shadow-lg"
            style={{ left: hover.x, top: hover.y }}
          >
            <p className="font-semibold">{hover.segment.label}</p>
            <p className="font-mono text-mist/80">
              {hover.segment.value} calls · {hover.percent}%
            </p>
          </div>
        )}
      </div>

      {delta && trend && (
        <p className={`mt-3 flex items-center justify-center gap-1 text-xs font-medium ${trendColor}`}>
          <TrendIcon className="h-3 w-3" />
          {delta}
        </p>
      )}

      {target !== undefined && (
        <p className="mt-1 text-center text-xs text-faint">
          Target {target}%{' '}
          <span className={onTarget ? 'text-sage' : 'text-amber'}>
            · {onTarget ? 'Above target' : 'Below target'}
          </span>
        </p>
      )}

      <ul className="mt-4 flex flex-col gap-1">
        {segments.map((seg) => {
          const percent = total > 0 ? Math.round((seg.value / total) * 100) : 0
          return (
            <li
              key={seg.label}
              onMouseEnter={() => showCentered(seg)}
              onMouseLeave={() => setHover(null)}
              className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm transition-colors duration-100 hover:bg-surface-hover"
            >
              <span className="flex min-w-0 items-center gap-2 text-body">
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${seg.colorClassName}`}
                  style={{ backgroundColor: 'currentColor' }}
                  aria-hidden="true"
                />
                <span className="truncate">{seg.label}</span>
              </span>
              <span className="shrink-0 font-mono text-xs text-muted">
                {seg.value} · {percent}%
              </span>
            </li>
          )
        })}
      </ul>

      {onOpen && (
        <span className="mt-2 flex items-center gap-0.5 text-xs font-medium text-faint opacity-0 transition-opacity duration-150 group-hover/donut:opacity-100 group-hover/donut:text-pulse">
          View details
          <ChevronRightIcon className="h-3.5 w-3.5" />
        </span>
      )}
    </div>
  )
}
