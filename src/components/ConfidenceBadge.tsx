import type { ConfidenceLevel } from '../types'
import { Tooltip } from './Tooltip'

const CONFIG: Record<
  ConfidenceLevel,
  { label: string; dot: string; text: string; bg: string }
> = {
  high: {
    label: 'High confidence',
    dot: 'bg-sage',
    text: 'text-sage',
    bg: 'bg-sage/12',
  },
  review: {
    label: 'Needs review',
    dot: 'bg-amber',
    text: 'text-amber',
    bg: 'bg-amber/14',
  },
  low: {
    label: 'Low confidence',
    dot: 'bg-pulse',
    text: 'text-pulse',
    bg: 'bg-pulse/12',
  },
}

/** Confidence is always paired with a label, never color alone — see the
 * accessibility requirements in section 5 of the plan. Hover/focus reveals
 * the exact score behind the label. */
export function ConfidenceBadge({
  level,
  score,
}: {
  level: ConfidenceLevel
  score?: number
}) {
  const c = CONFIG[level]
  const badge = (
    <span
      tabIndex={score !== undefined ? 0 : undefined}
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium outline-none ${c.bg} ${c.text}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${c.dot}`} aria-hidden="true" />
      {c.label}
    </span>
  )

  if (score === undefined) return badge
  return <Tooltip content={`${score}% confidence`}>{badge}</Tooltip>
}
