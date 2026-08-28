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
    <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-hairline bg-surface/60 px-8 py-16 text-center">
      <PulseLine
        mode="idle"
        height={40}
        className="w-40 text-muted"
        aria-label="Idle"
      />
      <div>
        <h3 className="font-display text-lg font-normal text-body">{title}</h3>
        <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
          {description}
        </p>
      </div>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="rounded-lg bg-pulse px-4 py-2 text-sm font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
        >
          {actionLabel}
        </button>
      )}
    </div>
  )
}
