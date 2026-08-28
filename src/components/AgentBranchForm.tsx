import { useState } from 'react'
import type { FlowNodeStatus } from '../types'
import { STATUS_OPTIONS } from './AgentNodeEditor'

/** Adds a new branch to the flow — connected from an existing node, so the
 * tree never has an orphan. Starts as a coverage gap until it's trained. */
export function AgentBranchForm({
  parentOptions,
  onCreate,
}: {
  parentOptions: { id: string; label: string }[]
  onCreate: (input: { label: string; parentId: string; status: FlowNodeStatus }) => void
}) {
  const [label, setLabel] = useState('')
  const [parentId, setParentId] = useState(parentOptions[0]?.id ?? '')
  const [status, setStatus] = useState<FlowNodeStatus>('gap')

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="branch-label">
          Branch name
        </label>
        <input
          id="branch-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Referral request"
          className="input mt-1.5 w-full"
        />
      </div>

      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="branch-parent">
          Connects from
        </label>
        <select
          id="branch-parent"
          value={parentId}
          onChange={(e) => setParentId(e.target.value)}
          className="mt-1.5 w-full rounded-full border border-hairline bg-surface px-4 py-1.5 text-sm text-body transition-colors focus:border-pulse/50 focus:outline-none"
        >
          {parentOptions.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">Coverage state</p>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              aria-pressed={status === opt.value}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors duration-150 ${
                status === opt.value
                  ? 'border-pulse bg-pulse/10 text-body'
                  : 'border-hairline text-muted hover:bg-surface-hover'
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${opt.dot}`} aria-hidden="true" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        disabled={!label.trim() || !parentId}
        onClick={() => onCreate({ label: label.trim(), parentId, status })}
        className="btn-primary self-start"
      >
        Add branch
      </button>
    </div>
  )
}
