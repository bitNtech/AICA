/** Before/after diff — used in Improvement Feed and (later) Simulation. */
export function DiffCard({ before, after }: { before: string; after: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-hairline bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Before
        </p>
        <p className="mt-2 text-sm leading-relaxed text-body">{before}</p>
      </div>
      <div className="rounded-2xl border border-sage/30 bg-sage/[0.06] p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-sage">
          After
        </p>
        <p className="mt-2 text-sm leading-relaxed text-body">{after}</p>
      </div>
    </div>
  )
}
