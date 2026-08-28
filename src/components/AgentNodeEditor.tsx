import type { AgentFlowNode } from '../types'

const STATUS_COPY: Record<AgentFlowNode['status'], string> = {
  covered: 'This path is trained and handling calls on its own.',
  gap: "This path doesn't have enough training data yet — calls here route to staff.",
  'never-say': 'This path always redirects to staff, by design — never automated.',
}

export function AgentNodeDetail({ node }: { node: AgentFlowNode }) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-body">{STATUS_COPY[node.status]}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-hairline bg-canvas p-3">
          <p className="text-xs text-muted">Calls trained on</p>
          <p className="mt-1 font-mono text-lg text-body">
            {node.callsHandled.toLocaleString()}
          </p>
        </div>
        <div className="rounded-xl border border-hairline bg-canvas p-3">
          <p className="text-xs text-muted">Confidence floor</p>
          <p className="mt-1 font-mono text-lg text-body">
            {Math.round(node.confidenceFloor * 100)}%
          </p>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">
          Source documents
        </p>
        <p className="mt-2 text-sm text-body">Front Desk Hours — Updated</p>
      </div>
    </div>
  )
}
