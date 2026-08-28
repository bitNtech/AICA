import { useEffect, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  MarkerType,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type NodeChange,
  type EdgeChange,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  mockAgentSetupStages,
  mockAttributeFields,
  mockBehaviorSliders,
  mockBehaviorToggles,
  mockCoverage,
  mockDocConflicts,
  mockFlowEdges,
  mockFlowNodes,
  mockGlobalFlows,
  mockKnowledgeDocs,
  mockLineTypes,
  mockNeverSayList,
  mockOrg,
  mockPreflightChecks,
  mockSelectedLineType,
  mockSetupChanges,
  mockSimulationRun,
  mockUnmappedAttributes,
} from '../data/mock'
import { CoverageMeter } from '../components/CoverageMeter'
import { NeverSayList } from '../components/NeverSayList'
import { StatusChip } from '../components/StatusChip'
import { Toggle } from '../components/Toggle'
import { SimResultsBar } from '../components/SimResultsBar'
import { AgentFlowNodeView, type FlowNodeData } from '../components/AgentFlowNodeView'
import { AgentNodeEditor } from '../components/AgentNodeEditor'
import { AgentBranchForm } from '../components/AgentBranchForm'
import { AttributeForm } from '../components/AttributeForm'
import { useUiStore } from '../store/ui'
import { useAgentConfigStore } from '../store/agentConfig'
import { AlertTriangleIcon, CheckIcon, ChevronRightIcon, CloseIcon } from '../components/icons'
import { formatBytes } from '../lib/format'
import type { AttributeField, BehaviorToggle, GlobalFlow } from '../types'

const ENTRY_NODE_ID = 'greeting'

function slugify(label: string): string {
  return (
    label
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') || 'branch'
  )
}

const nodeTypes = { agentNode: AgentFlowNodeView }

function buildInitialFlowNodes(): Node<FlowNodeData>[] {
  return mockFlowNodes.map((n) => ({
    id: n.id,
    type: 'agentNode',
    position: { x: n.x, y: n.y },
    deletable: n.id !== ENTRY_NODE_ID,
    data: {
      label: n.label,
      status: n.status,
      callsHandled: n.callsHandled,
      confidenceFloor: n.confidenceFloor,
    },
  }))
}

const EDGE_MARKER = { type: MarkerType.ArrowClosed, color: 'var(--color-muted)', width: 16, height: 16 }
const EDGE_STYLE = { stroke: 'var(--color-hairline)', strokeWidth: 1.5 }
const MINIMAP_COLOR: Record<FlowNodeData['status'], string> = {
  covered: 'var(--color-sage)',
  gap: 'var(--color-amber)',
  'never-say': 'var(--color-critical)',
}

function buildInitialFlowEdges(): Edge[] {
  return mockFlowEdges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    type: 'smoothstep',
    style: EDGE_STYLE,
    markerEnd: EDGE_MARKER,
  }))
}

/** The guided setup wizard from the product brief — seven stages, every one
 * pre-filled from the clinic's own call history. Linear on the first run,
 * but any stage can be reopened later without restarting the rest. Flow
 * edits (stage 3) live here, not inside the stage component, so they survive
 * switching stages and back. */
export function AgentBuilderPage({ onNavigate }: { onNavigate: (id: string) => void }) {
  const [stageId, setStageId] = useState(1)
  const stage = mockAgentSetupStages.find((s) => s.id === stageId) ?? mockAgentSetupStages[0]

  const [flowNodes, setFlowNodes, onFlowNodesChange] = useNodesState<Node<FlowNodeData>>(
    buildInitialFlowNodes(),
  )
  const [flowEdges, setFlowEdges, onFlowEdgesChange] = useEdgesState<Edge>(buildInitialFlowEdges())

  const [publishing, setPublishing] = useState(false)
  const [publishedVersion, setPublishedVersion] = useState<string | null>(null)

  function publish() {
    setPublishing(true)
    setTimeout(() => {
      setPublishing(false)
      setPublishedVersion('v1.5')
    }, 1000)
  }

  return (
    <div className="flex flex-col gap-6">
      <nav aria-label="Setup stages" className="card p-5">
        <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {mockAgentSetupStages.map((s) => {
            const done = s.id < stageId
            const active = s.id === stageId
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setStageId(s.id)}
                  aria-current={active ? 'step' : undefined}
                  className={`group flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors duration-150 ${
                    active
                      ? 'border-pulse bg-pulse/10'
                      : done
                        ? 'border-sage/25 bg-sage/5 hover:bg-sage/10'
                        : 'border-hairline bg-surface hover:bg-surface-hover'
                  }`}
                >
                  <span
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors duration-150 ${
                      done
                        ? 'bg-sage text-white'
                        : active
                          ? 'bg-pulse text-ink-teal'
                          : 'border-2 border-hairline bg-surface text-muted group-hover:border-pulse/40'
                    }`}
                  >
                    {done ? <CheckIcon className="h-3.5 w-3.5" /> : s.id}
                  </span>
                  <span
                    className={`text-sm font-medium ${
                      active || done ? 'text-body' : 'text-muted group-hover:text-body'
                    }`}
                  >
                    {s.label}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="min-w-0 flex-1">
        <div className="mb-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Stage {stage.id} of {mockAgentSetupStages.length} · {stage.badge}
          </p>
          <h2 className="mt-0.5 font-display text-lg font-normal text-body">{stage.label}</h2>
        </div>

        {stageId === 1 && <Stage1TypeSubtype />}
        {stageId === 2 && <Stage2Behaviour />}
        {stageId === 3 && (
          <Stage3Flow
            nodes={flowNodes}
            edges={flowEdges}
            onNodesChange={onFlowNodesChange}
            onEdgesChange={onFlowEdgesChange}
            setNodes={setFlowNodes}
            setEdges={setFlowEdges}
            onNavigate={onNavigate}
          />
        )}
        {stageId === 4 && <Stage4Attributes />}
        {stageId === 5 && <Stage5GlobalFlows />}
        {stageId === 6 && <Stage6Context onNavigate={onNavigate} />}
        {stageId === 7 && (
          <Stage7Review
            onNavigate={onNavigate}
            publishedVersion={publishedVersion}
          />
        )}

        <div className="mt-6 flex items-center justify-between border-t border-hairline pt-4">
          <button
            type="button"
            onClick={() => setStageId((s) => Math.max(1, s - 1))}
            disabled={stageId === 1}
            className="btn-ghost"
          >
            ← Back
          </button>
          {stageId < mockAgentSetupStages.length ? (
            <button
              type="button"
              onClick={() => setStageId((s) => Math.min(mockAgentSetupStages.length, s + 1))}
              className="btn-primary"
            >
              Continue
            </button>
          ) : (
            <button
              type="button"
              onClick={publish}
              disabled={publishing || publishedVersion !== null}
              className="btn-primary"
            >
              {publishing ? 'Publishing…' : publishedVersion ? `Published ${publishedVersion} ✓` : 'Publish'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Stage1TypeSubtype() {
  const [selectedId, setSelectedId] = useState(mockSelectedLineType)
  const autoDetected = mockLineTypes.find((t) => t.id === mockSelectedLineType)
  const selected = mockLineTypes.find((t) => t.id === selectedId) ?? mockLineTypes[0]

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-pulse/25 bg-pulse/10 p-4 text-sm text-body">
        <span className="font-semibold">Auto-detected.</span> {autoDetected?.matchPercent}% of your
        uploaded calls are {autoDetected?.label.toLowerCase()}. We've pre-selected the matching type
        — change it if that's not the line you're automating.
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {mockLineTypes.map((t) => {
          const active = t.id === selectedId
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setSelectedId(t.id)}
              aria-pressed={active}
              className={`rounded-2xl border p-4 text-left transition-colors duration-150 ${
                active
                  ? 'border-pulse bg-pulse/10'
                  : 'border-hairline bg-surface hover:bg-surface-hover'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium text-body">{t.label}</p>
                {active && <CheckIcon className="h-4 w-4 shrink-0 text-pulse" />}
              </div>
              <p className="mt-1 text-xs text-muted">{t.detail}</p>
              {t.matchPercent !== undefined && (
                <p className="mt-2 text-xs font-semibold text-pulse">{t.matchPercent}% match</p>
              )}
            </button>
          )
        })}
      </div>

      <div className="card grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">Sub-type</p>
          <p className="mt-1 text-sm text-body">Healthcare › Family clinic › Multi-location</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-faint">
            Starting template
          </p>
          <p className="mt-1 text-sm text-body">
            {selected.id === mockSelectedLineType
              ? 'Clinic · Appointments v3'
              : `Generic · ${selected.label} v1`}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted">
        Presets applied downstream: behaviour profile · flow skeleton · 6 default attributes ·
        escalation policy
      </p>
    </div>
  )
}

const SAMPLE_LINE = (org: string) =>
  `Good morning, ${org} — this is Ava. Am I speaking with the patient, or booking on someone's behalf?`

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  window.speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.rate = 0.95
  utterance.pitch = 1.05
  window.speechSynthesis.speak(utterance)
}

function Stage2Behaviour() {
  const [toggles, setToggles] = useState<BehaviorToggle[]>(mockBehaviorToggles)
  const [sliders, setSliders] = useState(mockBehaviorSliders.map((s) => ({ ...s, current: s.value })))
  const [speaking, setSpeaking] = useState(false)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window

  function playSample() {
    if (!canSpeak) return
    setSpeaking(true)
    const utterance = new SpeechSynthesisUtterance(SAMPLE_LINE(mockOrg.name))
    utterance.rate = 0.95
    utterance.pitch = 1.05
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(utterance)
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="card p-5">
        <p className="text-sm font-medium text-body">Personality & delivery</p>
        <p className="mt-1 text-xs text-muted">
          Fingerprinted from 217 golden calls — sliders start where your top-performing calls sit.
        </p>
        <div className="mt-4 flex flex-col gap-4">
          {sliders.map((s, i) => {
            const edited = s.current !== s.value || !s.matched
            return (
              <div key={s.id} className="flex items-center gap-4">
                <span className="w-44 shrink-0 text-sm text-body">{s.label}</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={s.current}
                  onChange={(e) => {
                    const v = Number(e.target.value)
                    setSliders((prev) => prev.map((x, idx) => (idx === i ? { ...x, current: v } : x)))
                  }}
                  className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-track accent-pulse"
                />
                <span className="w-28 shrink-0 text-right text-xs text-muted">
                  {s.current} ·{' '}
                  <span className={edited ? 'text-amber' : 'text-sage'}>
                    {edited ? 'you edited' : 'matched'}
                  </span>
                </span>
              </div>
            )
          })}
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm font-medium text-body">Voice & conversational habits</p>
        <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-hairline bg-canvas px-4 py-3">
          <span className="text-sm text-body">Ava · warm, mid-pitch, en-IN / en-GB</span>
          <button
            type="button"
            onClick={playSample}
            disabled={!canSpeak}
            className="btn-ghost !px-3 !py-1 text-xs disabled:opacity-40"
            title={canSpeak ? undefined : "This browser doesn't support voice playback"}
          >
            {speaking ? '■ Stop' : '▶ Sample'}
          </button>
        </div>
        <div className="mt-1 flex flex-col divide-y divide-hairline">
          {toggles.map((t, i) => (
            <div key={t.id} className="flex items-center justify-between gap-3 py-2.5">
              <span className="text-sm text-body">{t.label}</span>
              <Toggle
                checked={t.enabled}
                onChange={(v) =>
                  setToggles((prev) => prev.map((x, idx) => (idx === i ? { ...x, enabled: v } : x)))
                }
                label={t.label}
              />
            </div>
          ))}
        </div>
      </div>

      <NeverSayList initial={mockNeverSayList} />

      <div className="rounded-xl border border-hairline bg-surface-warm px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">Live sample</p>
          <button
            type="button"
            onClick={() => speak(SAMPLE_LINE(mockOrg.name))}
            disabled={!canSpeak}
            className="text-xs font-medium text-pulse hover:underline disabled:opacity-40 disabled:no-underline"
          >
            ▶ Play
          </button>
        </div>
        <p className="mt-1 font-mono text-sm text-body">"{SAMPLE_LINE(mockOrg.name)}"</p>
      </div>
    </div>
  )
}

function Stage3Flow({
  nodes,
  edges,
  onNodesChange,
  onEdgesChange,
  setNodes,
  setEdges,
  onNavigate,
}: {
  nodes: Node<FlowNodeData>[]
  edges: Edge[]
  onNodesChange: (changes: NodeChange<Node<FlowNodeData>>[]) => void
  onEdgesChange: (changes: EdgeChange[]) => void
  setNodes: (updater: (prev: Node<FlowNodeData>[]) => Node<FlowNodeData>[]) => void
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void
  onNavigate: (id: string) => void
}) {
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  function statusSubtitle(status: FlowNodeData['status']) {
    return status === 'never-say'
      ? 'Always redirected'
      : status === 'gap'
        ? 'Coverage gap'
        : 'Covered path'
  }

  function openEditor(node: Node<FlowNodeData>) {
    openDrawer({
      title: node.data.label,
      subtitle: statusSubtitle(node.data.status),
      body: (
        <AgentNodeEditor
          data={node.data}
          canDelete={node.id !== ENTRY_NODE_ID}
          onSave={(next) => {
            setNodes((prev) =>
              prev.map((n) => (n.id === node.id ? { ...n, data: { ...n.data, ...next } } : n)),
            )
            closeDrawer()
          }}
          onDelete={() => {
            setNodes((prev) => prev.filter((n) => n.id !== node.id))
            setEdges((prev) => prev.filter((e) => e.source !== node.id && e.target !== node.id))
            closeDrawer()
          }}
        />
      ),
    })
  }

  function onNodeClick(_: unknown, clicked: Node) {
    const match = nodes.find((n) => n.id === clicked.id)
    if (match) openEditor(match)
  }

  function onNodesDelete(deleted: Node[]) {
    const ids = new Set(deleted.map((n) => n.id))
    setEdges((prev) => prev.filter((e) => !ids.has(e.source) && !ids.has(e.target)))
  }

  function onConnect(connection: Connection) {
    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          type: 'smoothstep',
          style: EDGE_STYLE,
          markerEnd: EDGE_MARKER,
        },
        eds,
      ),
    )
  }

  function openAddBranch() {
    const parentOptions = nodes.map((n) => ({ id: n.id, label: n.data.label }))
    openDrawer({
      title: 'Add a branch',
      subtitle: 'Creates a new node, connected from an existing one in the tree.',
      body: (
        <AgentBranchForm
          parentOptions={parentOptions}
          onCreate={({ label, parentId, status }) => {
            const parent = nodes.find((n) => n.id === parentId)
            const siblingCount = edges.filter((e) => e.source === parentId).length
            const baseId = slugify(label)
            let id = baseId
            let suffix = 1
            while (nodes.some((n) => n.id === id)) {
              id = `${baseId}-${suffix++}`
            }
            const newNode: Node<FlowNodeData> = {
              id,
              type: 'agentNode',
              position: {
                x: (parent?.position.x ?? 0) + 260,
                y: (parent?.position.y ?? 0) + siblingCount * 100,
              },
              deletable: true,
              data: {
                label,
                status,
                callsHandled: 0,
                confidenceFloor: status === 'never-say' ? 1 : 0.7,
              },
            }
            setNodes((prev) => [...prev, newNode])
            setEdges((prev) => [
              ...prev,
              {
                id: `e-${parentId}-${id}`,
                source: parentId,
                target: id,
                type: 'smoothstep',
                style: EDGE_STYLE,
                markerEnd: EDGE_MARKER,
              },
            ])
            closeDrawer()
          }}
        />
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <CoverageMeter {...mockCoverage} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-body">Main flow — drafted from your calls</p>
          <p className="mt-0.5 text-xs text-muted">
            This is what AICA follows on a live call once published — try changes with Simulate
            first.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-3 text-xs text-muted">
            <LegendDot className="bg-sage" label="Covered" />
            <LegendDot className="bg-amber" label="Coverage gap" />
            <LegendDot className="bg-critical" label="Never-say" />
          </div>
          <button
            type="button"
            onClick={openAddBranch}
            className="btn-secondary !px-3.5 !py-1.5 text-xs"
          >
            + Add branch
          </button>
          <button
            type="button"
            onClick={() => onNavigate('simulation')}
            className="flex items-center gap-1 text-xs font-medium text-pulse hover:underline"
          >
            Simulate
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <div className="h-[540px] overflow-hidden rounded-2xl border border-hairline bg-surface shadow-sm">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodesDelete={onNodesDelete}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodesDraggable
          nodesConnectable
          edgesFocusable
          elementsSelectable
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
          colorMode="light"
          defaultEdgeOptions={{ style: EDGE_STYLE, markerEnd: EDGE_MARKER }}
        >
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--color-hairline)" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => MINIMAP_COLOR[(n.data as FlowNodeData).status]}
            maskColor="rgb(243 239 227 / 70%)"
            className="!border !border-hairline !bg-canvas"
            pannable
            zoomable
          />
          <FitOnCountChange count={nodes.length} />
        </ReactFlow>
      </div>
      <p className="text-xs text-muted">
        Drag to rearrange, drag from a node's edge to wire a new connection, or click a node to
        edit or delete it. Select an edge and press Delete to remove a connection.
      </p>
    </div>
  )
}

/** Re-frames the canvas when a node is added or removed, so the change is
 * visible immediately instead of requiring a manual zoom-to-fit. */
function FitOnCountChange({ count }: { count: number }) {
  const { fitView } = useReactFlow()
  const first = useRef(true)

  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    fitView({ padding: 0.2, duration: 300 })
  }, [count, fitView])

  return null
}

function LegendDot({ className, label }: { className: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${className}`} aria-hidden="true" />
      {label}
    </span>
  )
}

function Stage4Attributes() {
  const [fields, setFields] = useState<AttributeField[]>(mockAttributeFields)
  const [unmapped, setUnmapped] = useState(mockUnmappedAttributes)
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  function openEditor(field: AttributeField, index: number) {
    openDrawer({
      title: field.name,
      subtitle: 'Edit how this attribute is captured, validated, and mapped.',
      body: (
        <div className="flex flex-col gap-5">
          <AttributeForm
            initial={field}
            onSave={(next) => {
              setFields((prev) => prev.map((f, i) => (i === index ? next : f)))
              closeDrawer()
            }}
          />
          <button
            type="button"
            onClick={() => {
              setFields((prev) => prev.filter((_, i) => i !== index))
              closeDrawer()
            }}
            className="btn-danger self-start"
          >
            Remove attribute
          </button>
        </div>
      ),
    })
  }

  function openAdd(fromUnmapped?: string) {
    openDrawer({
      title: fromUnmapped ? `Map "${fromUnmapped}"` : 'Add attribute',
      subtitle: 'Captured on every call, validated live before it reaches the CRM.',
      body: (
        <AttributeForm
          initial={{
            name: fromUnmapped ?? '',
            type: 'Text',
            validation: '',
            required: true,
            capturedAt: 'Detect intent',
            mapsTo: '',
          }}
          onSave={(next) => {
            setFields((prev) => [...prev, next])
            if (fromUnmapped) {
              setUnmapped((prev) => prev.filter((a) => a.label !== fromUnmapped))
            }
            closeDrawer()
          }}
        />
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <button
          type="button"
          onClick={() => openAdd()}
          className="btn-secondary !px-3.5 !py-1.5 text-xs"
        >
          + Add attribute
        </button>
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead>
              <tr className="border-b border-hairline bg-surface-elevated text-xs text-muted">
                <th className="px-4 py-3 font-medium">Attribute</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Live validation</th>
                <th className="px-4 py-3 text-center font-medium">Required</th>
                <th className="px-4 py-3 font-medium">Captured at</th>
                <th className="px-4 py-3 font-medium">Maps to</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline">
              {fields.map((f, i) => (
                <tr
                  key={f.name}
                  onClick={() => openEditor(f, i)}
                  className="cursor-pointer hover:bg-surface-hover"
                >
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-body">
                    {f.name}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{f.type}</td>
                  <td className="px-4 py-3 text-muted">{f.validation}</td>
                  <td className="px-4 py-3 text-center">
                    {f.required ? (
                      <CheckIcon className="mx-auto h-4 w-4 text-sage" />
                    ) : (
                      <span className="text-faint">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted">{f.capturedAt}</td>
                  <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">
                    {f.mapsTo}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {unmapped.length > 0 && (
        <div className="rounded-xl border border-amber/30 bg-amber/10 px-4 py-3 text-sm text-body">
          <p className="font-semibold text-amber">
            {unmapped.length} more found in your calls, not yet mapped
          </p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {unmapped.map((a) => (
              <li key={a.label} className="flex items-center justify-between gap-3">
                <span>
                  <span className="font-mono text-xs">{a.label}</span> — asked in {a.askedPercent}%
                  of calls
                </span>
                <button
                  type="button"
                  onClick={() => openAdd(a.label)}
                  className="shrink-0 text-xs font-medium text-pulse hover:underline"
                >
                  Map →
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Stage5GlobalFlows() {
  const [flows, setFlows] = useState<GlobalFlow[]>(mockGlobalFlows)
  const enabledCount = flows.filter((f) => f.enabled).length

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted">
        <span className="font-semibold text-body">
          {enabledCount} of {flows.length} enabled.
        </span>{' '}
        These behaviours can fire at any point in a call, then return the caller to where they
        were.
      </p>
      <div className="card flex flex-col divide-y divide-hairline">
        {flows.map((f, i) => (
          <div key={f.id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-body">{f.label}</p>
              <p className="mt-0.5 truncate text-xs text-muted">{f.detail}</p>
            </div>
            <Toggle
              checked={f.enabled}
              onChange={(v) =>
                setFlows((prev) => prev.map((x, idx) => (idx === i ? { ...x, enabled: v } : x)))
              }
              label={f.label}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

function Stage6Context({ onNavigate }: { onNavigate: (id: string) => void }) {
  const conflicts = mockDocConflicts.length
  const fresh = mockKnowledgeDocs.filter((d) => d.status === 'fresh').length

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-body">Knowledge sources</p>
          <button
            type="button"
            onClick={() => onNavigate('knowledge-base')}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-pulse hover:underline"
          >
            Manage in Knowledge Base
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="mt-1 text-xs text-muted">
          {mockKnowledgeDocs.length} documents indexed · {fresh} fresh — retrieved live during
          calls, every spoken answer carries a citation back to one of these.
        </p>
        <ul className="mt-3 divide-y divide-hairline">
          {mockKnowledgeDocs.slice(0, 5).map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate text-body">{doc.title}</span>
              <StatusChip status={doc.status} />
            </li>
          ))}
        </ul>
      </div>

      {conflicts > 0 && (
        <div className="rounded-2xl border border-critical/30 bg-critical/10 p-4">
          <p className="text-sm font-semibold text-critical">
            {conflicts} conflict blocking publish
          </p>
          <p className="mt-1 text-sm text-body">{mockDocConflicts[0].topic}</p>
          <button
            type="button"
            onClick={() => onNavigate('knowledge-base')}
            className="mt-2 flex items-center gap-1 text-xs font-medium text-critical hover:underline"
          >
            Resolve in Knowledge Base
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <AdditionalContextPanel />
    </div>
  )
}

function AdditionalContextPanel() {
  const docs = useAgentConfigStore((s) => s.additionalContext)
  const addDocs = useAgentConfigStore((s) => s.addAdditionalContext)
  const removeDoc = useAgentConfigStore((s) => s.removeAdditionalContext)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    addDocs(
      Array.from(fileList).map((f) => ({
        id: `ctx-${Date.now()}-${f.name}`,
        name: f.name,
        sizeLabel: formatBytes(f.size),
      })),
    )
  }

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-body">Additional context for this agent</p>
          <p className="mt-1 text-xs text-muted">
            Scoped to this configuration only — kept separate from the shared Knowledge Base
            library. Used automatically in Simulation &amp; Testing while you iterate, and
            bundled into this version when you publish.
          </p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="btn-secondary shrink-0 !px-3.5 !py-1.5 text-xs"
        >
          + Upload files
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {docs.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-hairline bg-canvas px-4 py-6 text-center text-xs text-muted">
          No additional documents yet — upload a one-off file (a draft script, a pricing sheet)
          to test with, without adding it to the shared library.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-hairline">
          {docs.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="truncate text-body">{doc.name}</p>
                <p className="text-xs text-muted">{doc.sizeLabel}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-full bg-sage/12 px-2 py-0.5 text-[11px] font-medium text-sage">
                  Attached
                </span>
                <button
                  type="button"
                  onClick={() => removeDoc(doc.id)}
                  aria-label={`Remove ${doc.name}`}
                  title="Remove"
                  className="flex h-7 w-7 items-center justify-center rounded-full text-faint transition-colors hover:bg-surface-hover hover:text-body"
                >
                  <CloseIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stage7Review({
  onNavigate,
  publishedVersion,
}: {
  onNavigate: (id: string) => void
  publishedVersion: string | null
}) {
  const hasConflict = mockDocConflicts.length > 0
  const additionalContext = useAgentConfigStore((s) => s.additionalContext)
  const changes =
    additionalContext.length > 0
      ? [
          ...mockSetupChanges,
          `+ context  ${additionalContext.length} additional document${additionalContext.length === 1 ? '' : 's'} attached`,
        ]
      : mockSetupChanges

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-5">
        <p className="text-sm font-medium text-body">Changes in this version</p>
        <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
          {changes.map((c) => (
            <li
              key={c}
              className={
                c.startsWith('+') ? 'text-sage' : c.startsWith('−') ? 'text-critical' : 'text-signal'
              }
            >
              {c}
            </li>
          ))}
        </ul>
      </div>

      <div className="card p-5">
        <p className="text-sm font-medium text-body">Pre-flight checks</p>
        <ul className="mt-2 flex flex-col gap-2">
          {mockPreflightChecks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm text-body">
              <CheckIcon className="h-4 w-4 shrink-0 text-sage" />
              {c.label}
            </li>
          ))}
          {hasConflict && (
            <li className="flex items-center justify-between gap-2 text-sm text-amber">
              <span className="flex items-center gap-2">
                <AlertTriangleIcon className="h-4 w-4 shrink-0" />
                {mockDocConflicts.length} knowledge conflict unresolved
              </span>
              <button
                type="button"
                onClick={() => onNavigate('knowledge-base')}
                className="text-xs font-medium hover:underline"
              >
                Fix →
              </button>
            </li>
          )}
        </ul>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-medium text-body">
            Simulation · {mockSimulationRun.totalCalls} real calls replayed
          </p>
          <button
            type="button"
            onClick={() => onNavigate('simulation')}
            className="flex shrink-0 items-center gap-1 text-xs font-medium text-pulse hover:underline"
          >
            View full simulation
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-3">
          <SimResultsBar run={mockSimulationRun} />
        </div>
      </div>

      <div className="card p-5">
        <p className="text-sm font-medium text-body">Publish</p>
        {publishedVersion ? (
          <p className="mt-2 flex items-center gap-2 text-sm font-medium text-sage">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Published as {publishedVersion} — AICA is answering with this configuration now.
          </p>
        ) : (
          <p className="mt-1 text-xs text-muted">
            Publishing replaces the live configuration immediately — every change is logged to the
            audit trail with who published it and when.
          </p>
        )}
      </div>
    </div>
  )
}
