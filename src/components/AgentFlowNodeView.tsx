import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowNodeStatus } from '../types'

const STATUS_STYLE: Record<FlowNodeStatus, string> = {
  covered: 'border-sage/50 bg-surface',
  gap: 'border-amber/60 bg-amber/[0.06]',
  'never-say': 'border-critical/60 bg-critical/[0.06]',
}

const STATUS_DOT: Record<FlowNodeStatus, string> = {
  covered: 'bg-sage',
  gap: 'bg-amber',
  'never-say': 'bg-critical',
}

export type FlowNodeData = {
  label: string
  status: FlowNodeStatus
  callsHandled: number
}

/** Read-mostly node for the Agent Builder graph — generated from ingestion,
 * not drag-to-build. Color signals coverage state at a glance. */
export function AgentFlowNodeView({ data }: NodeProps & { data: FlowNodeData }) {
  return (
    <div
      className={`rounded-xl border px-3.5 py-2.5 text-left shadow-sm ${STATUS_STYLE[data.status]}`}
      style={{ width: 170 }}
    >
      <Handle type="target" position={Position.Left} className="!bg-muted" />
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATUS_DOT[data.status]}`} />
        <p className="truncate text-xs font-semibold text-body">{data.label}</p>
      </div>
      <p className="mt-1 font-mono text-[11px] text-muted">
        {data.callsHandled.toLocaleString()} calls
      </p>
      <Handle type="source" position={Position.Right} className="!bg-muted" />
    </div>
  )
}
