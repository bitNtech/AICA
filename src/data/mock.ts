import type {
  AgentStatus,
  AttentionItem,
  CallLogEntry,
  LiveCall,
  NavItem,
  StatSeries,
} from '../types'

/**
 * Fixture data standing in for the backend API/websocket. AICA answers
 * inbound calls, handles minimal front-desk tasks itself (scheduling,
 * hours, simple intake), and redirects anything past that scope to staff —
 * every mock reflects that split rather than "AI makes calls."
 */

export const mockAgentStatus: AgentStatus = 'answering'

export const mockOrg = {
  name: 'Riverside Family Clinic',
  initials: 'RF',
}

export const mockCitationSource = {
  docTitle: 'Front Desk Hours — Updated',
  excerpt:
    '"Rescheduling requests within 24 hours of an appointment should be routed to the on-call coordinator rather than confirmed automatically."',
}

export const mockStats: StatSeries[] = [
  {
    id: 'calls-answered',
    label: 'Calls answered today',
    value: '128',
    numericValue: 128,
    format: 'count',
    delta: '+14 vs. yesterday',
    trend: 'up',
    series: [
      { label: 'Wed', value: 96 },
      { label: 'Thu', value: 104 },
      { label: 'Fri', value: 112 },
      { label: 'Sat', value: 74 },
      { label: 'Sun', value: 62 },
      { label: 'Mon', value: 108 },
      { label: 'Today', value: 128 },
    ],
  },
  {
    id: 'resolved-no-redirect',
    label: 'Resolved without redirect',
    value: '81%',
    numericValue: 81,
    format: 'percent',
    delta: '+3pts this week',
    trend: 'up',
    series: [],
  },
  {
    id: 'matched-human',
    label: 'Matched-or-beat front-desk score',
    value: '91%',
    numericValue: 91,
    format: 'percent',
    delta: 'Steady this week',
    trend: 'flat',
    series: [],
  },
]

export const mockLiveCalls: LiveCall[] = [
  {
    id: 'call-1042',
    callerLabel: 'Caller •• 0148',
    intent: 'Rescheduling — Rm. 3',
    startedAt: new Date(Date.now() - 74_000).toISOString(),
    durationSec: 74,
    confidence: 'high',
    confidenceScore: 96,
  },
  {
    id: 'call-1043',
    callerLabel: 'Caller •• 7723',
    intent: 'Insurance question — redirecting',
    startedAt: new Date(Date.now() - 41_000).toISOString(),
    durationSec: 41,
    confidence: 'low',
    confidenceScore: 38,
  },
  {
    id: 'call-1044',
    callerLabel: 'Caller •• 3390',
    intent: 'New patient intake',
    startedAt: new Date(Date.now() - 132_000).toISOString(),
    durationSec: 132,
    confidence: 'high',
    confidenceScore: 91,
  },
  {
    id: 'call-1045',
    callerLabel: 'Caller •• 5561',
    intent: 'Prescription refill request',
    startedAt: new Date(Date.now() - 18_000).toISOString(),
    durationSec: 18,
    confidence: 'review',
    confidenceScore: 68,
  },
]

export const primaryNav: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', href: '/' },
  {
    id: 'live-calls',
    label: 'Live Calls',
    href: '/live-calls',
    badge: mockLiveCalls.length,
  },
  { id: 'call-log', label: 'Call Log', href: '/call-log' },
  { id: 'knowledge-base', label: 'Knowledge Base', href: '/knowledge-base' },
  { id: 'agent-builder', label: 'Agent Builder', href: '/agent-builder' },
  { id: 'simulation', label: 'Simulation & Testing', href: '/simulation' },
  { id: 'rollout', label: 'Rollout', href: '/rollout' },
  {
    id: 'improvement-feed',
    label: 'Improvement Feed',
    href: '/improvement-feed',
    badge: 2,
  },
  { id: 'data-readiness', label: 'Data Readiness', href: '/data-readiness' },
]

export const footerNav: NavItem[] = [
  { id: 'compliance', label: 'Compliance & Audit', href: '/compliance' },
  { id: 'integrations', label: 'Integrations', href: '/integrations' },
  { id: 'settings', label: 'Settings', href: '/settings' },
]

export const mockAttentionItems: AttentionItem[] = [
  {
    id: 'attn-1',
    title: '1 call redirected — no staff picked up',
    detail: 'Caller •• 7723 was sent to the front desk line and reached voicemail.',
    severity: 'warning',
  },
  {
    id: 'attn-2',
    title: '2 calls flagged for review',
    detail: 'Low-confidence responses on insurance eligibility questions.',
    severity: 'warning',
  },
  {
    id: 'attn-3',
    title: 'Knowledge Base: 1 conflicting document',
    detail: '"2026 Holiday Hours" contradicts "Front Desk Hours — Updated."',
    severity: 'critical',
  },
]

export const mockCallLog: CallLogEntry[] = [
  {
    id: 'log-2031',
    callerLabel: 'Caller •• 0148',
    intent: 'Rescheduling — Rm. 3',
    outcome: 'resolved',
    outcomeLabel: 'Resolved by AICA',
    confidence: 'high',
    confidenceScore: 94,
    durationSec: 96,
    timestamp: new Date(Date.now() - 3_600_000).toISOString(),
    redirected: false,
  },
  {
    id: 'log-2030',
    callerLabel: 'Caller •• 4471',
    intent: 'Clinical question — medication dosage',
    outcome: 'redirected',
    outcomeLabel: 'Redirected to nurse line',
    confidence: 'low',
    confidenceScore: 31,
    durationSec: 52,
    timestamp: new Date(Date.now() - 5_200_000).toISOString(),
    redirected: true,
  },
  {
    id: 'log-2029',
    callerLabel: 'Caller •• 9902',
    intent: 'Hours & location',
    outcome: 'resolved',
    outcomeLabel: 'Resolved by AICA',
    confidence: 'high',
    confidenceScore: 97,
    durationSec: 34,
    timestamp: new Date(Date.now() - 6_100_000).toISOString(),
    redirected: false,
  },
  {
    id: 'log-2028',
    callerLabel: 'Caller •• 1187',
    intent: 'Prescription refill request',
    outcome: 'voicemail',
    outcomeLabel: 'Voicemail taken for pharmacy team',
    confidence: 'review',
    confidenceScore: 71,
    durationSec: 61,
    timestamp: new Date(Date.now() - 9_400_000).toISOString(),
    redirected: false,
  },
  {
    id: 'log-2027',
    callerLabel: 'Caller •• 5561',
    intent: 'Billing dispute',
    outcome: 'no_answer_redirect',
    outcomeLabel: 'Redirected — front desk unavailable',
    confidence: 'low',
    confidenceScore: 44,
    durationSec: 88,
    timestamp: new Date(Date.now() - 11_000_000).toISOString(),
    redirected: true,
  },
]
