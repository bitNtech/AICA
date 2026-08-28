import { useMemo } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  BackgroundVariant,
  type Node,
  type Edge,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  mockCoverage,
  mockFlowEdges,
  mockFlowNodes,
  mockNeverSayList,
} from '../data/mock'
import { CoverageMeter } from '../components/CoverageMeter'
import { NeverSayList } from '../components/NeverSayList'
import { AgentFlowNodeView, type FlowNodeData } from '../components/AgentFlowNodeView'
import { AgentNodeDetail } from '../components/AgentNodeDetail'
import { useUiStore } from '../store/ui'
import { useTheme } from '../lib/useTheme'

const nodeTypes = { agentNode: AgentFlowNodeView }

export function AgentBuilderPage() {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const theme = useTheme()

  const nodes: Node<FlowNodeData>[] = useMemo(
    () =>
      mockFlowNodes.map((n) => ({
        id: n.id,
        type: 'agentNode',
        position: { x: n.x, y: n.y },
        data: { label: n.label, status: n.status, callsHandled: n.callsHandled },
      })),
    [],
  )

  const edges: Edge[] = useMemo(
    () =>
      mockFlowEdges.map((e) => ({
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'smoothstep',
        style: { stroke: 'var(--color-hairline)', strokeWidth: 1.5 },
      })),
    [],
  )

  function onNodeClick(_: unknown, node: Node) {
    const source = mockFlowNodes.find((n) => n.id === node.id)
    if (!source) return
    openDrawer({
      title: source.label,
      subtitle: `${source.status === 'never-say' ? 'Always redirected' : source.status === 'gap' ? 'Coverage gap' : 'Covered path'}`,
      body: <AgentNodeDetail node={source} />,
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <CoverageMeter {...mockCoverage} />
      <NeverSayList initial={mockNeverSayList} />

      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-body">Agent flow</p>
        <div className="flex items-center gap-4 text-xs text-muted">
          <LegendDot className="bg-sage" label="Covered" />
          <LegendDot className="bg-amber" label="Coverage gap" />
          <LegendDot className="bg-critical" label="Never-say" />
        </div>
      </div>

      <div className="h-[560px] overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodeClick={onNodeClick}
          nodesDraggable={false}
          nodesConnectable={false}
          edgesFocusable={false}
          elementsSelectable
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode={theme}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-hairline)" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted">
        Generated from your call history — read-mostly for now. Click a node
        for detail. Full visual authoring is on the roadmap.
      </p>
    </div>
  )
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  )
}
