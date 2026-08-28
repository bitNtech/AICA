/** Before/after diff — used in Improvement Feed and (later) Simulation. When
 * `onAfterChange` is given, the "after" side becomes a real editable draft
 * instead of a fixed suggestion — review it, tweak the wording, then decide. */
export function DiffCard({
  before,
  after,
  onAfterChange,
}: {
  before: string
  after: string
  onAfterChange?: (next: string) => void
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-hairline bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Before
        </p>
        <p className="mt-2 text-sm leading-relaxed text-body">{before}</p>
      </div>
      <div className="rounded-2xl border border-sage/30 bg-sage/10 p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage">
          After{onAfterChange ? ' — editable' : ''}
        </p>
        {onAfterChange ? (
          <textarea
            value={after}
            onChange={(e) => onAfterChange(e.target.value)}
            rows={3}
            className="mt-2 w-full resize-none rounded-lg border border-sage/25 bg-surface px-2.5 py-2 text-sm leading-relaxed text-body transition-colors focus:border-sage/60 focus:outline-none"
          />
        ) : (
          <p className="mt-2 text-sm leading-relaxed text-body">{after}</p>
        )}
      </div>
    </div>
  )
}
