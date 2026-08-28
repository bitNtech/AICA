import { useState } from 'react'
import type { DocConflict } from '../types'

/** Side-by-side of two contradicting passages — one action, "which is
 * correct," rather than making staff dig through both documents. */
export function DocConflictView({ conflict }: { conflict: DocConflict }) {
  const [resolved, setResolved] = useState<'A' | 'B' | null>(null)

  if (resolved) {
    const winner = resolved === 'A' ? conflict.docA : conflict.docB
    return (
      <div className="flex flex-col gap-3 rounded-2xl border border-sage/30 bg-sage/10 p-4">
        <p className="text-sm font-medium text-body">
          "{winner.title}" will be used going forward.
        </p>
        <p className="text-sm text-muted">
          The other document has been flagged for the team to update or
          retire.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">{conflict.topic}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ConflictCard
          title={conflict.docA.title}
          excerpt={conflict.docA.excerpt}
          onChoose={() => setResolved('A')}
        />
        <ConflictCard
          title={conflict.docB.title}
          excerpt={conflict.docB.excerpt}
          onChoose={() => setResolved('B')}
        />
      </div>
    </div>
  )
}

function ConflictCard({
  title,
  excerpt,
  onChoose,
}: {
  title: string
  excerpt: string
  onChoose: () => void
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-hairline bg-surface-warm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {title}
      </p>
      <p className="flex-1 font-mono text-sm leading-relaxed text-body">
        {excerpt}
      </p>
      <button type="button" onClick={onChoose} className="btn-secondary self-start !px-3.5 !py-1.5 text-xs font-semibold">
        This one is correct
      </button>
    </div>
  )
}
