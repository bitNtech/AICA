import { Handle, Position, type NodeProps } from '@xyflow/react'
import type { FlowNodeStatus } from '../types'
import { AlertTriangleIcon, CheckIcon, CloseIcon } from './icons'

const STATUS_STYLE: Record<FlowNodeStatus, string> = {
  covered: 'border-sage/40 bg-surface',
  gap: 'border-amber/50 bg-amber/10',
  'never-say': 'border-critical/50 bg-critical/10',
}

const STATUS_ICON_STYLE: Record<FlowNodeStatus, string> = {
  covered: 'bg-sage text-white',
  gap: 'bg-amber text-ink-teal',
  'never-say': 'bg-critical text-white',
}

const STATUS_HANDLE: Record<FlowNodeStatus, string> = {
  covered: '!bg-sage',
  gap: '!bg-amber',
  'never-say': '!bg-critical',
}

const STATUS_ICON: Record<FlowNodeStatus, typeof CheckIcon> = {
  covered: CheckIcon,
  gap: AlertTriangleIcon,
  'never-say': CloseIcon,
}

export type FlowNodeData = {
  label: string
  status: FlowNodeStatus
  callsHandled: number
  confidenceFloor: number
}

/** Editable node for the Agent Builder graph — generated from ingestion,
 * then dragged, rewired and edited by hand. Color and icon signal coverage
 * state at a glance; the ring shows it's selected and ready to edit or
 * connect. Port color matches the node's own status, LangFlow-style, so a
 * tangle of wires still reads as three coverage lanes at a glance. */
export function AgentFlowNodeView({ data, selected }: NodeProps & { data: FlowNodeData }) {
  const Icon = STATUS_ICON[data.status]
  return (
    <div
      className={`cursor-pointer rounded-2xl border px-3.5 py-3 text-left shadow-sm transition-all duration-150 hover:shadow-md ${STATUS_STYLE[data.status]} ${
        selected ? 'ring-2 ring-pulse ring-offset-2 ring-offset-canvas' : ''
      }`}
      style={{ width: 184 }}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={`!h-3 !w-3 !border-2 !border-surface ${STATUS_HANDLE[data.status]}`}
      />
      <div className="flex items-center gap-2">
        <span
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${STATUS_ICON_STYLE[data.status]}`}
        >
          <Icon className="h-3 w-3" />
        </span>
        <p className="truncate text-xs font-semibold text-body">{data.label}</p>
      </div>
      <p className="mt-1.5 font-mono text-[11px] text-muted">
        {data.callsHandled.toLocaleString()} calls
      </p>
      <Handle
        type="source"
        position={Position.Right}
        className={`!h-3 !w-3 !border-2 !border-surface ${STATUS_HANDLE[data.status]}`}
      />
    </div>
  )
}
