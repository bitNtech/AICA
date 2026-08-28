import { useState } from 'react'
import type { FlowNodeStatus } from '../types'
import type { FlowNodeData } from './AgentFlowNodeView'
import { CloseIcon } from './icons'

export const STATUS_OPTIONS: { value: FlowNodeStatus; label: string; dot: string }[] = [
  { value: 'covered', label: 'Covered', dot: 'bg-sage' },
  { value: 'gap', label: 'Coverage gap', dot: 'bg-amber' },
  { value: 'never-say', label: 'Never-say', dot: 'bg-critical' },
]

const STATUS_COPY: Record<FlowNodeStatus, string> = {
  covered: 'This path is trained and handling calls on its own.',
  gap: "This path doesn't have enough training data yet — calls here route to staff.",
  'never-say': 'This path always redirects to staff, by design — never automated.',
}

/** The edit form behind every node — rename it, move it between coverage
 * states, retune its confidence floor, or remove it. Calls trained-on stays
 * read-only: that number comes from ingested call history, not a hand edit. */
export function AgentNodeEditor({
  data,
  canDelete,
  onSave,
  onDelete,
}: {
  data: FlowNodeData
  canDelete: boolean
  onSave: (next: Pick<FlowNodeData, 'label' | 'status' | 'confidenceFloor'>) => void
  onDelete: () => void
}) {
  const [label, setLabel] = useState(data.label)
  const [status, setStatus] = useState<FlowNodeStatus>(data.status)
  const [floor, setFloor] = useState(Math.round(data.confidenceFloor * 100))

  const dirty =
    label !== data.label || status !== data.status || floor !== Math.round(data.confidenceFloor * 100)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="node-label">
          Branch name
        </label>
        <input
          id="node-label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className="input mt-1.5 w-full"
        />
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
        <p className="mt-1.5 text-xs text-muted">{STATUS_COPY[status]}</p>
      </div>

      {status !== 'never-say' && (
        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="node-floor">
              Confidence floor
            </label>
            <span className="font-mono text-xs text-body">{floor}%</span>
          </div>
          <input
            id="node-floor"
            type="range"
            min={0}
            max={100}
            value={floor}
            onChange={(e) => setFloor(Number(e.target.value))}
            className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-track accent-pulse"
          />
          <p className="mt-1 text-xs text-muted">
            Below this, a call on this branch hands off to staff instead of AICA answering alone.
          </p>
        </div>
      )}

      <div className="rounded-xl border border-hairline bg-canvas p-3">
        <p className="text-xs text-muted">Calls trained on</p>
        <p className="mt-1 font-mono text-lg text-body">{data.callsHandled.toLocaleString()}</p>
        <p className="mt-1 text-xs text-faint">
          From ingested call history — updates when the corpus is re-mined, not by hand.
        </p>
      </div>

      <div className="flex items-center gap-2 border-t border-hairline pt-4">
        <button
          type="button"
          disabled={!dirty || !label.trim()}
          onClick={() => onSave({ label: label.trim(), status, confidenceFloor: floor / 100 })}
          className="btn-primary"
        >
          Save changes
        </button>
        {canDelete ? (
          <button type="button" onClick={onDelete} className="btn-danger">
            <CloseIcon className="h-3.5 w-3.5" />
            Delete branch
          </button>
        ) : (
          <span className="text-xs text-faint">This is the entry point — it can't be deleted.</span>
        )}
      </div>
    </div>
  )
}
