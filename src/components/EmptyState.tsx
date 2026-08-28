import { PulseLine } from './PulseLine'

interface EmptyStateProps {
  title: string
  description: string
  actionLabel?: string
  onAction?: () => void
}

/** Idle Pulse Line + one clear next action — never a bare "no data" message. */
export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-hairline bg-surface/50 px-8 py-16 text-center">
      <PulseLine
        mode="idle"
        height={40}
        className="w-40 text-pulse/60"
        aria-label="Idle"
      />
      <div>
        <h3 className="font-display text-lg font-normal text-body">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <button type="button" onClick={onAction} className="btn-primary !px-5">
          {actionLabel}
        </button>
      )}
    </div>
  )
}
