import { useEffect, useRef } from 'react'
import { useUiStore } from '../store/ui'
import { CloseIcon } from '../components/icons'

/** The single "see more without losing your place" mechanism — used for
 * transcripts, document previews, citations, node detail. Drawer over
 * navigation, everywhere, consistently. */
export function ContextDrawer() {
  const drawer = useUiStore((s) => s.drawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)
  const panelRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!drawer) return
    panelRef.current?.focus()

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') closeDrawer()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [drawer, closeDrawer])

  if (!drawer) return null

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-ink-teal/30"
        onClick={closeDrawer}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={drawer.title}
        className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[460px] flex-col bg-surface shadow-2xl outline-none"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-hairline px-6 py-5">
          <div>
            <h2 className="font-display text-lg font-normal text-body">
              {drawer.title}
            </h2>
            {drawer.subtitle && (
              <p className="mt-0.5 text-sm text-muted">{drawer.subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={closeDrawer}
            aria-label="Close panel"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-muted hover:bg-canvas hover:text-body"
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5">{drawer.body}</div>
      </div>
    </>
  )
}
