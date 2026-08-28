import type { AttentionItem } from '../types'
import { useUiStore } from '../store/ui'
import { AlertCircleIcon, AlertTriangleIcon } from './icons'

const SEVERITY_ICON: Record<AttentionItem['severity'], typeof AlertTriangleIcon> = {
  info: AlertCircleIcon,
  warning: AlertCircleIcon,
  critical: AlertTriangleIcon,
}

const SEVERITY_COLOR: Record<AttentionItem['severity'], string> = {
  info: 'text-sage',
  warning: 'text-amber',
  critical: 'text-pulse',
}

/** The trust-building panel — proudly shows "0 items" when clear, and
 * turns every flagged item into a one-click action rather than a report. */
export function AttentionList({ items }: { items: AttentionItem[] }) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  if (items.length === 0) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface px-5 py-6">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sage/12 text-sage">
          <AlertCircleIcon className="h-4 w-4" />
        </span>
        <p className="text-sm text-muted">
          Nothing needs review right now — AICA is handling calls on its own.
        </p>
      </div>
    )
  }

  function review(item: AttentionItem) {
    openDrawer({
      title: item.title,
      subtitle: item.detail,
      body: (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-body">
            Review this item and either confirm AICA's handling was correct
            or send it back for a fix.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-lg bg-pulse px-3 py-1.5 text-sm font-semibold text-white transition-transform duration-150 ease-out hover:-translate-y-0.5 hover:shadow-md"
            >
              Mark as reviewed
            </button>
            <button
              type="button"
              onClick={closeDrawer}
              className="rounded-lg border border-hairline px-3 py-1.5 text-sm font-medium text-muted hover:text-body"
            >
              Dismiss
            </button>
          </div>
        </div>
      ),
    })
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface-warm">
      <ul className="divide-y divide-hairline">
        {items.map((item) => {
          const Icon = SEVERITY_ICON[item.severity]
          return (
            <li key={item.id} className="flex items-start gap-3 px-5 py-4">
              <Icon
                className={`mt-0.5 h-4 w-4 shrink-0 ${SEVERITY_COLOR[item.severity]}`}
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-body">{item.title}</p>
                <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
              </div>
              <button
                type="button"
                onClick={() => review(item)}
                className="shrink-0 rounded-lg border border-hairline px-2.5 py-1 text-xs font-semibold text-body hover:border-pulse/40 hover:text-pulse"
              >
                Review
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
