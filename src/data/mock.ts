import type {
  AgentFlowEdge,
  AgentFlowNode,
  AgentStatus,
  AttentionItem,
  AuditLogEntry,
  CallLogEntry,
  DocConflict,
  ImprovementItem,
  Integration,
  IntentThreshold,
  KnowledgeDoc,
  LiveCall,
  NavItem,
  ReadinessSource,
  RedactionExample,
  Role,
  SimulationCall,
  SimulationRun,
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
    delta: '+3.0 pts this week',
    trend: 'up',
    series: [],
    target: 78,
  },
  {
    id: 'matched-human',
    label: 'Matched-or-beat front-desk score',
    value: '91%',
    numericValue: 91,
    format: 'percent',
    delta: '+3.0 pts this week',
    trend: 'flat',
    series: [],
    target: 88,
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
    target: 'call-log',
    targetFilter: { outcome: 'no_answer_redirect' },
  },
  {
    id: 'attn-2',
    title: '2 calls flagged for review',
    detail: 'Low-confidence responses on insurance eligibility questions.',
    severity: 'warning',
    target: 'call-log',
    targetFilter: { confidence: 'review' },
  },
  {
    id: 'attn-3',
    title: 'Knowledge Base: 1 conflicting document',
    detail: '"2026 Holiday Hours" contradicts "Front Desk Hours — Updated."',
    severity: 'critical',
    target: 'knowledge-base',
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

const day = 86_400_000

export const mockKnowledgeDocs: KnowledgeDoc[] = [
  {
    id: 'doc-1',
    title: 'Front Desk Hours — Updated',
    status: 'conflicting',
    updatedAt: new Date(Date.now() - 2 * day).toISOString(),
    sizeLabel: '4 pages',
    conflictId: 'conflict-1',
  },
  {
    id: 'doc-2',
    title: '2026 Holiday Hours',
    status: 'conflicting',
    updatedAt: new Date(Date.now() - 6 * day).toISOString(),
    sizeLabel: '1 page',
    conflictId: 'conflict-1',
  },
  {
    id: 'doc-3',
    title: 'New Patient Intake Packet',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 5 * day).toISOString(),
    sizeLabel: '8 pages',
  },
  {
    id: 'doc-4',
    title: 'Insurance Providers Accepted',
    status: 'stale',
    updatedAt: new Date(Date.now() - 95 * day).toISOString(),
    sizeLabel: '3 pages',
  },
  {
    id: 'doc-5',
    title: 'Prescription Refill Policy',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 12 * day).toISOString(),
    sizeLabel: '2 pages',
  },
  {
    id: 'doc-6',
    title: 'Billing & Payment FAQ',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 20 * day).toISOString(),
    sizeLabel: '3 pages',
  },
  {
    id: 'doc-7',
    title: 'After-Hours Voicemail Script',
    status: 'stale',
    updatedAt: new Date(Date.now() - 140 * day).toISOString(),
    sizeLabel: '1 page',
  },
]

export const mockDocConflicts: DocConflict[] = [
  {
    id: 'conflict-1',
    topic: 'Rescheduling within the holiday window',
    docA: {
      title: 'Front Desk Hours — Updated',
      excerpt:
        '"Rescheduling requests within 24 hours of an appointment should be routed to the on-call coordinator rather than confirmed automatically."',
    },
    docB: {
      title: '2026 Holiday Hours',
      excerpt:
        '"During the holiday period (Dec 20–Jan 2), all rescheduling requests are confirmed automatically, regardless of notice given."',
    },
  },
]

export const mockNeverSayList: string[] = [
  'Never provide a specific diagnosis or medical advice',
  "Never confirm insurance coverage without verifying eligibility first",
  "Never disclose one patient's information to another caller",
  'Never guarantee same-day appointment availability',
]

export const mockCoverage = {
  percent: 78,
  handledCalls: 3120,
  totalCalls: 4000,
  gaps: [
    { label: 'Complex billing disputes', callsPerWeek: 12 },
    { label: 'Multi-provider scheduling conflicts', callsPerWeek: 7 },
    { label: 'Referral requests', callsPerWeek: 5 },
  ],
}

export const mockFlowNodes: AgentFlowNode[] = [
  { id: 'greeting', label: 'Greeting & Intent', status: 'covered', callsHandled: 4128, confidenceFloor: 0.5, x: 0, y: 180 },
  { id: 'scheduling', label: 'Scheduling', status: 'covered', callsHandled: 1486, confidenceFloor: 0.72, x: 300, y: 0 },
  { id: 'hours', label: 'Hours & Location', status: 'covered', callsHandled: 812, confidenceFloor: 0.6, x: 300, y: 110 },
  { id: 'prescription', label: 'Prescription Refill', status: 'covered', callsHandled: 604, confidenceFloor: 0.68, x: 300, y: 220 },
  { id: 'insurance', label: 'Insurance Question', status: 'gap', callsHandled: 298, confidenceFloor: 0.75, x: 300, y: 330 },
  { id: 'billing', label: 'Billing Dispute', status: 'gap', callsHandled: 156, confidenceFloor: 0.8, x: 300, y: 440 },
  { id: 'clinical', label: 'Clinical Question', status: 'never-say', callsHandled: 89, confidenceFloor: 1, x: 620, y: 385 },
  { id: 'resolve', label: 'Resolved', status: 'covered', callsHandled: 3120, confidenceFloor: 0, x: 620, y: 55 },
  { id: 'redirect', label: 'Redirect to Staff', status: 'covered', callsHandled: 908, confidenceFloor: 0, x: 620, y: 220 },
]

export const mockFlowEdges: AgentFlowEdge[] = [
  { id: 'e1', source: 'greeting', target: 'scheduling' },
  { id: 'e2', source: 'greeting', target: 'hours' },
  { id: 'e3', source: 'greeting', target: 'prescription' },
  { id: 'e4', source: 'greeting', target: 'insurance' },
  { id: 'e5', source: 'greeting', target: 'billing' },
  { id: 'e6', source: 'scheduling', target: 'resolve' },
  { id: 'e7', source: 'hours', target: 'resolve' },
  { id: 'e8', source: 'prescription', target: 'resolve' },
  { id: 'e9', source: 'insurance', target: 'redirect' },
  { id: 'e10', source: 'billing', target: 'redirect' },
  { id: 'e11', source: 'insurance', target: 'clinical' },
  { id: 'e12', source: 'clinical', target: 'redirect' },
]

export const mockSimulationRun: SimulationRun = {
  id: 'sim-14',
  configLabel: 'v14 — insurance intent rewrite',
  ranAt: new Date(Date.now() - 2 * 3_600_000).toISOString(),
  totalCalls: 240,
  beat: 62,
  matched: 143,
  worse: 35,
  humanAuditedCount: 12,
  humanAgreedCount: 11,
}

export const mockSimulationCalls: SimulationCall[] = [
  {
    id: 'sc-1',
    intent: 'Rescheduling — Rm. 3',
    result: 'beat',
    agentResponse:
      'Offered the next three available slots and confirmed by text, without being asked.',
    humanResponse: 'Confirmed a single new time, no text follow-up.',
  },
  {
    id: 'sc-2',
    intent: 'Hours & location',
    result: 'matched',
    agentResponse: 'Gave hours and parking-lot directions.',
    humanResponse: 'Gave hours and parking-lot directions.',
  },
  {
    id: 'sc-3',
    intent: 'Insurance eligibility',
    result: 'worse',
    agentResponse: "Said coverage 'should be fine' without checking the payer list.",
    humanResponse: 'Looked up the payer list and gave a precise answer.',
  },
  {
    id: 'sc-4',
    intent: 'Prescription refill',
    result: 'beat',
    agentResponse: 'Confirmed pharmacy on file and logged the refill request immediately.',
    humanResponse: 'Took a message for the pharmacy team to call back.',
  },
  {
    id: 'sc-5',
    intent: 'Billing dispute',
    result: 'worse',
    agentResponse: 'Apologized but could not explain the charge breakdown.',
    humanResponse: 'Walked the caller through each line item.',
  },
  {
    id: 'sc-6',
    intent: 'New patient intake',
    result: 'matched',
    agentResponse: 'Collected the standard intake fields and scheduled a first visit.',
    humanResponse: 'Collected the standard intake fields and scheduled a first visit.',
    ghost: true,
  },
  {
    id: 'sc-7',
    intent: 'Insurance eligibility',
    result: 'matched',
    agentResponse: 'Checked the payer list and gave a precise answer.',
    humanResponse: 'Checked the payer list and gave a precise answer.',
    ghost: true,
  },
]

export const mockRollout = {
  stages: [0, 10, 50, 100],
  currentStageIndex: 2,
  matchedHumanRateByStage: { 0: null, 10: 88, 50: 91, 100: null } as Record<number, number | null>,
}

export const mockIntentThresholds: IntentThreshold[] = [
  { intent: 'Scheduling', floor: 0.6 },
  { intent: 'Hours & location', floor: 0.5 },
  { intent: 'Prescription refill', floor: 0.68 },
  { intent: 'Insurance question', floor: 0.75 },
  { intent: 'Billing dispute', floor: 0.85 },
  { intent: 'Clinical question', floor: 1 },
]

export const mockImprovementItems: ImprovementItem[] = [
  {
    id: 'imp-1',
    title: '143 callers asked about Saturday slots',
    detail:
      'AICA had no confident answer for Saturday availability and redirected all of them. A drafted fix adds the Saturday schedule to its scheduling responses.',
    callsAffected: 143,
    before: "I don't have Saturday hours on file — let me connect you with the front desk.",
    after: "We're open Saturdays 9am–1pm for select providers — want me to check availability?",
    status: 'pending',
  },
  {
    id: 'imp-2',
    title: '38 callers asked about parking',
    detail:
      'A recurring question with no scripted answer. Drafted from the "Front Desk Hours — Updated" document.',
    callsAffected: 38,
    before: "I'm not sure about parking — connecting you to the front desk.",
    after: 'Free parking is available in the lot behind the building, entrance on 5th Ave.',
    status: 'queued',
  },
  {
    id: 'imp-3',
    title: '19 callers asked to speak to a specific provider by name',
    detail:
      'AICA now offers to leave a message with the provider’s team instead of a flat redirect.',
    callsAffected: 19,
    before: "I can't transfer you directly — connecting you with the front desk.",
    after: "I can take a message for Dr. Patel's team and have them call you back today.",
    status: 'approved',
  },
]

export const mockReadinessSources: ReadinessSource[] = [
  {
    id: 'call-archive',
    label: 'Call archive',
    percent: 82,
    detail: '1,240 historical calls imported, most with clear outcomes.',
    nextStep: 'Upload the last 3 months to improve recent-intent coverage.',
  },
  {
    id: 'crm-export',
    label: 'CRM / EHR export',
    percent: 46,
    detail: 'Outcome labels are missing for about half of imported records.',
    nextStep: 'Connect your EHR directly, or use the Call Log bulk-tagging tool.',
  },
  {
    id: 'documents',
    label: 'Document uploads',
    percent: 91,
    detail: '7 policy documents indexed and current.',
    nextStep: 'Resolve the 1 conflicting document in Knowledge Base.',
  },
]

export const mockOverallReadiness = 70

export const mockAuditLog: AuditLogEntry[] = [
  { id: 'audit-1', actor: 'Priya N.', action: 'Changed confidence floor', target: 'Insurance question → 75%', timestamp: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 'audit-2', actor: 'AICA (automated)', action: 'Approved improvement', target: '"143 callers asked about Saturday slots"', timestamp: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 'audit-3', actor: 'Marcus D.', action: 'Resolved conflict', target: '"Front Desk Hours — Updated" vs "2026 Holiday Hours"', timestamp: new Date(Date.now() - 26_000_000).toISOString() },
  { id: 'audit-4', actor: 'Priya N.', action: 'Advanced rollout stage', target: '10% → 50%', timestamp: new Date(Date.now() - 90_000_000).toISOString() },
  { id: 'audit-5', actor: 'Marcus D.', action: 'Uploaded document', target: 'Prescription Refill Policy', timestamp: new Date(Date.now() - 1_036_800_000).toISOString() },
]

export const mockRedactionExamples: RedactionExample[] = [
  {
    original: 'This is John Miller, my date of birth is 4/12/1985 and my number is 555-0148.',
    redacted: 'This is [NAME], my date of birth is [DOB] and my number is [PHONE].',
  },
  {
    original: "My policy number is BC-88213-A and I live at 210 Maple Street.",
    redacted: 'My policy number is [POLICY_ID] and I live at [ADDRESS].',
  },
]

export const mockRoles: Role[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full control, including rollout stage and confidence floors.',
    canDo: ['Change rollout stage', 'Edit confidence floors', 'Manage users', 'Approve improvements'],
    cannotDo: [],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews calls and approves improvements, no rollout or user control.',
    canDo: ['Tag call outcomes', 'Approve or dismiss improvements', 'Resolve document conflicts'],
    cannotDo: ['Change rollout stage', 'Manage users', 'Edit confidence floors'],
  },
  {
    id: 'read-only',
    name: 'Read-only',
    description: 'Can see everything, change nothing — for auditors and stakeholders.',
    canDo: ['View all dashboards, logs, and transcripts'],
    cannotDo: ['Edit anything', 'Approve or dismiss items', 'Export data'],
  },
]

export const mockIntegrations: Integration[] = [
  { id: 'telephony', name: 'Twilio Voice', category: 'Telephony', status: 'connected', detail: 'Receiving calls on (555) 013-0148' },
  { id: 'calendar', name: 'Google Calendar', category: 'Scheduling', status: 'connected', detail: 'Synced 4 provider calendars' },
  { id: 'ehr', name: 'Athenahealth', category: 'EHR', status: 'error', detail: 'Auth token expired — reconnect to resume syncing' },
  { id: 'crm', name: 'HubSpot', category: 'CRM', status: 'disconnected', detail: 'Not connected' },
]
