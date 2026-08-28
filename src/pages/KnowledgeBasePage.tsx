import { mockDocConflicts, mockKnowledgeDocs } from '../data/mock'
import { StatusChip } from '../components/StatusChip'
import { DocConflictView } from '../components/DocConflictView'
import { UploadPanel } from '../components/UploadPanel'
import { KnowledgeBaseIcon } from '../components/icons'
import { useUiStore } from '../store/ui'
import type { KnowledgeDoc } from '../types'

export function KnowledgeBasePage() {
  const openDrawer = useUiStore((s) => s.openDrawer)

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
        <p className="text-sm text-muted">
          AICA references this document when a caller's question matches its
          content. Preview and full-text search land in a later phase.
        </p>
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted">
          {mockKnowledgeDocs.length} documents · AICA cites these on live
          calls
        </p>
        <button type="button" onClick={openUpload} className="btn-primary">
          Upload document
        </button>
      </div>

      <div className="overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
        <ul className="divide-y divide-hairline">
          {mockKnowledgeDocs.map((doc) => (
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
    </div>
  )
}
