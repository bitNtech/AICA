import { mockCitationSource } from '../data/mock'

/** The source excerpt a CitationChip reveals — shared so the Dashboard's
 * in-place drawer swap and the Live Calls page's fresh drawer show the
 * same passage. */
export function CitationSourceCard() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-warm p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">
        {mockCitationSource.docTitle}
      </p>
      <p className="mt-2 font-mono text-sm leading-relaxed text-body">
        {mockCitationSource.excerpt}
      </p>
    </div>
  )
}
