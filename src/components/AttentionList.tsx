import type { AttentionItem, CallLogSeed } from '../types'
import { useUiStore } from '../store/ui'
import { AlertCircleIcon, AlertTriangleIcon } from './icons'

const SEVERITY_CONFIG: Record<
  AttentionItem['severity'],
  { icon: typeof AlertTriangleIcon; text: string; chipBg: string; border: string; tag: string }
> = {
  info: {
    icon: AlertCircleIcon,
    text: 'text-info',
    chipBg: 'bg-info/12',
    border: 'border-l-info',
    tag: 'Info',
  },
  warning: {
    icon: AlertCircleIcon,
    text: 'text-amber',
    chipBg: 'bg-amber/12',
    border: 'border-l-amber',
    tag: 'Warning',
  },
  critical: {
    icon: AlertTriangleIcon,
    text: 'text-critical',
    chipBg: 'bg-critical/12',
    border: 'border-l-critical',
    tag: 'Urgent',
  },
}

/** The trust-building panel — proudly shows "0 items" when clear, and
 * turns every flagged item into a one-click drill-down into the exact
 * records behind it, rather than a report to read and dismiss. */
export function AttentionList({
  items,
  onNavigate,
}: {
  items: AttentionItem[]
  onNavigate: (id: string, filter?: CallLogSeed) => void
}) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  if (items.length === 0) {
    return (
      <div className="card flex items-center gap-3 px-5 py-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sage/12 text-sage">
          <AlertCircleIcon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-sm font-medium text-body">All clear</p>
          <p className="text-sm text-muted">
            Nothing needs review right now — AICA is handling calls on its own.
          </p>
        </div>
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
            <button type="button" onClick={closeDrawer} className="btn-primary">
              Mark as reviewed
            </button>
            <button type="button" onClick={closeDrawer} className="btn-ghost">
              Dismiss
            </button>
          </div>
        </div>
      ),
    })
  }

  function open(item: AttentionItem) {
    if (item.target) {
      onNavigate(item.target, item.targetFilter)
    } else {
      review(item)
    }
  }

  return (
    <ul className="flex flex-col gap-2.5">
      {items.map((item) => {
        const c = SEVERITY_CONFIG[item.severity]
        const Icon = c.icon
        return (
          <li
            key={item.id}
            onClick={() => open(item)}
            className={`card flex cursor-pointer items-start gap-3.5 border-l-4 ${c.border} px-5 py-4 transition-colors duration-150 hover:bg-surface-hover`}
          >
            <span
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${c.chipBg} ${c.text}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p
                className={`text-[10.5px] font-semibold uppercase tracking-wider ${c.text}`}
              >
                {c.tag}
              </p>
              <p className="mt-0.5 text-sm font-medium text-body">{item.title}</p>
              <p className="mt-0.5 text-sm text-muted">{item.detail}</p>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                open(item)
              }}
              className="btn-secondary shrink-0 !px-3.5 !py-1.5 text-xs"
            >
              {item.target ? 'View' : 'Review'}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
