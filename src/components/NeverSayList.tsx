import { useState } from 'react'
import { CloseIcon } from './icons'

/** Compliance officers need to audit this in five seconds — never more
 * than one click to view or edit in full. */
export function NeverSayList({ initial }: { initial: string[] }) {
  const [items, setItems] = useState(initial)
  const [draft, setDraft] = useState('')

  function add() {
    const value = draft.trim()
    if (!value) return
    setItems((prev) => [...prev, value])
    setDraft('')
  }

  return (
    <div className="rounded-2xl border border-hairline bg-surface p-5 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 shrink-0 rounded-full bg-critical" aria-hidden="true" />
        <p className="text-sm font-medium text-body">Never-say list</p>
      </div>
      <p className="mt-1 text-xs text-muted">
        AICA will not say any of the following, on any call — a hard rule, not a suggestion.
      </p>
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item, i) => (
          <li
            key={item}
            className="flex items-center gap-2 rounded-full border border-critical/25 bg-critical/[0.06] px-3 py-1.5 text-xs text-body"
          >
            {item}
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}
              aria-label={`Remove "${item}"`}
              className="text-critical/60 hover:text-critical"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
          placeholder="Add a rule…"
          className="input flex-1 bg-canvas"
        />
        <button type="button" onClick={add} className="btn-secondary !bg-canvas">
          Add
        </button>
      </div>
    </div>
  )
}
