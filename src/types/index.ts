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
