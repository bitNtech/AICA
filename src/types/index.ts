/**
 * Shared domain types — the frontend/backend API contract.
 * AICA is an inbound attendant: it answers calls, handles minimal
 * front-desk tasks itself, and redirects anything beyond that to staff.
 */

export type ConfidenceLevel = 'high' | 'review' | 'low'

export type CallOutcome =
  | 'resolved'
  | 'redirected'
  | 'voicemail'
  | 'no_answer_redirect'

export interface LiveCall {
  id: string
  callerLabel: string
  intent: string
  startedAt: string
  durationSec: number
  confidence: ConfidenceLevel
  confidenceScore: number
}

export interface CallLogEntry {
  id: string
  callerLabel: string
  intent: string
  outcome: CallOutcome
  outcomeLabel: string
  confidence: ConfidenceLevel
  confidenceScore: number
  durationSec: number
  timestamp: string
  redirected: boolean
}

export interface StatSeries {
  id: string
  label: string
  value: string
  numericValue: number
  format: 'count' | 'percent'
  delta?: string
  trend: 'up' | 'down' | 'flat'
  /** Recent history for the count format's bar chart — last entry is "today". */
  series: { label: string; value: number }[]
  /** `percent` format only — the practice's own benchmark for this metric. */
  target?: number
}

export type AttentionSeverity = 'info' | 'warning' | 'critical'

export interface AttentionItem {
  id: string
  title: string
  detail: string
  severity: AttentionSeverity
  href?: string
}

export type AgentStatus = 'answering' | 'paused' | 'degraded'

export interface NavItem {
  id: string
  label: string
  href: string
  badge?: number
}

export type DocStatus = 'fresh' | 'stale' | 'conflicting'

export interface KnowledgeDoc {
  id: string
  title: string
  status: DocStatus
  updatedAt: string
  sizeLabel: string
  conflictId?: string
}

export interface DocConflict {
  id: string
  topic: string
  docA: { title: string; excerpt: string }
  docB: { title: string; excerpt: string }
}

export type FlowNodeStatus = 'covered' | 'gap' | 'never-say'

export interface AgentFlowNode {
  id: string
  label: string
  status: FlowNodeStatus
  callsHandled: number
  confidenceFloor: number
  x: number
  y: number
}

export interface AgentFlowEdge {
  id: string
  source: string
  target: string
}

export type SimResult = 'beat' | 'matched' | 'worse'

export interface SimulationRun {
  id: string
  configLabel: string
  ranAt: string
  totalCalls: number
  beat: number
  matched: number
  worse: number
  humanAuditedCount: number
  humanAgreedCount: number
}

export interface SimulationCall {
  id: string
  intent: string
  result: SimResult
  agentResponse: string
  humanResponse: string
  ghost?: boolean
}

export interface IntentThreshold {
  intent: string
  floor: number
}

export type ImprovementStatus = 'pending' | 'queued' | 'approved' | 'dismissed'

export interface ImprovementItem {
  id: string
  title: string
  detail: string
  callsAffected: number
  before: string
  after: string
  status: ImprovementStatus
}

export interface ReadinessSource {
  id: string
  label: string
  percent: number
  detail: string
  nextStep: string
}

export interface AuditLogEntry {
  id: string
  actor: string
  action: string
  target: string
  timestamp: string
}

export interface RedactionExample {
  original: string
  redacted: string
}

export interface Role {
  id: string
  name: string
  description: string
  canDo: string[]
  cannotDo: string[]
}

export type IntegrationStatus = 'connected' | 'disconnected' | 'error'

export interface Integration {
  id: string
  name: string
  category: string
  status: IntegrationStatus
  detail: string
}
