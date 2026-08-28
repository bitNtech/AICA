import { useMemo, useState } from 'react'
import { mockDocConflicts, mockKnowledgeDocs } from '../data/mock'
import { StatusChip } from '../components/StatusChip'
import { DocConflictView } from '../components/DocConflictView'
import { UploadPanel } from '../components/UploadPanel'
import { EmptyState } from '../components/EmptyState'
import { KnowledgeBaseIcon } from '../components/icons'
import { useUiStore } from '../store/ui'
import type { DocStatus, KnowledgeDoc } from '../types'

const STATUS_OPTIONS: { value: 'all' | DocStatus; label: string }[] = [
  { value: 'all', label: 'All statuses' },
  { value: 'fresh', label: 'Fresh' },
  { value: 'stale', label: 'Stale' },
  { value: 'conflicting', label: 'Conflicting' },
]

export function KnowledgeBasePage() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>(mockKnowledgeDocs)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | DocStatus>('all')
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return docs.filter((d) => {
      if (statusFilter !== 'all' && d.status !== statusFilter) return false
      if (q && !d.title.toLowerCase().includes(q)) return false
      return true
    })
  }, [docs, search, statusFilter])

  function markReviewed(id: string) {
    setDocs((prev) =>
      prev.map((d) => (d.id === id ? { ...d, status: 'fresh', updatedAt: new Date().toISOString() } : d)),
    )
    closeDrawer()
  }

  function deleteDoc(id: string) {
    setDocs((prev) => prev.filter((d) => d.id !== id))
    closeDrawer()
  }

  function openUpload() {
    openDrawer({
      title: 'Upload a document',
      subtitle: 'AICA will read it and cite it on future calls',
      body: <UploadPanel />,
    })
  }

  function openDoc(doc: KnowledgeDoc) {
    if (doc.status === 'conflicting' && doc.conflictId) {
      const conflict = mockDocConflicts.find((c) => c.id === doc.conflictId)
      if (conflict) {
        openDrawer({
          title: 'Resolve conflict',
          subtitle: `"${conflict.docA.title}" vs. "${conflict.docB.title}"`,
          body: <DocConflictView conflict={conflict} />,
        })
        return
      }
    }
    openDrawer({
      title: doc.title,
      subtitle: `${doc.sizeLabel} · updated ${new Date(doc.updatedAt).toLocaleDateString()}`,
      body: (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-hairline bg-surface-warm p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted">
              Cited excerpt
            </p>
            <p className="mt-2 font-mono text-sm text-body">{doc.excerpt}</p>
          </div>
          <p className="text-sm text-muted">
            AICA references this document live when a caller's question matches its content —
            every spoken answer built from it carries this citation.
          </p>
          <div className="flex flex-wrap gap-2 border-t border-hairline pt-4">
            {doc.status === 'stale' && (
              <button type="button" onClick={() => markReviewed(doc.id)} className="btn-primary">
                Mark as reviewed
              </button>
            )}
            <button type="button" onClick={() => deleteDoc(doc.id)} className="btn-danger">
              Delete document
            </button>
          </div>
        </div>
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents…"
            className="input w-64"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | DocStatus)}
            className="rounded-full border border-hairline bg-surface px-3.5 py-1.5 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-3">
          <p className="font-mono text-xs text-faint">
            {rows.length} of {docs.length} documents
          </p>
          <button type="button" onClick={openUpload} className="btn-primary">
            Upload document
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title={docs.length === 0 ? 'No documents yet' : 'No documents match these filters'}
          description={
            docs.length === 0
              ? 'Upload the first policy, price list, or FAQ for AICA to cite on calls.'
              : 'Try a different search term or status.'
          }
          actionLabel={docs.length === 0 ? 'Upload document' : undefined}
          onAction={docs.length === 0 ? openUpload : undefined}
        />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
          <ul className="divide-y divide-hairline">
            {rows.map((doc) => (
              <li key={doc.id}>
                <button
                  type="button"
                  onClick={() => openDoc(doc)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-surface-hover"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-canvas text-muted">
                    <KnowledgeBaseIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-body">
                      {doc.title}
                    </p>
                    <p className="mt-0.5 font-mono text-xs text-muted">
                      {doc.sizeLabel} · updated{' '}
                      {new Date(doc.updatedAt).toLocaleDateString()}
                    </p>
                  </div>
                  <StatusChip status={doc.status} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
