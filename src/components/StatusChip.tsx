import type { DocStatus } from '../types'

const CONFIG: Record<DocStatus, { label: string; className: string }> = {
  fresh: { label: 'Fresh', className: 'bg-sage/12 text-sage' },
  stale: { label: 'Stale', className: 'bg-amber/15 text-amber' },
  conflicting: { label: 'Conflicting', className: 'bg-critical/12 text-critical' },
}

/** Staleness/conflict as the primary visual signal, not buried metadata. */
export function StatusChip({ status }: { status: DocStatus }) {
  const c = CONFIG[status]
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.className}`}
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {c.label}
    </span>
  )
}
