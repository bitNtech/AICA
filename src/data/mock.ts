import type {
  AgentFlowEdge,
  AgentFlowNode,
  AgentSetupStage,
  AgentStatus,
  AttentionItem,
  AttributeField,
  BehaviorSlider,
  BehaviorToggle,
  CallLogEntry,
  DocConflict,
  GlobalFlow,
  ImprovementItem,
  Integration,
  KnowledgeDoc,
  LineType,
  LiveCall,
  LowConfidenceAction,
  NavItem,
  Role,
  SimulationCall,
  SimulationRun,
  StatSeries,
  UsageMetric,
  UserAccount,
} from '../types'
import { env } from '../lib/env'

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
  plan: 'Growth plan',
}

export const mockUsage: UsageMetric[] = [
  {
    id: 'cost',
    label: 'Cost this month',
    value: '$412.80',
    used: 412.8,
    limit: 600,
    unit: 'USD',
  },
  {
    id: 'compute',
    label: 'AI compute minutes',
    value: '3,240 min',
    used: 3240,
    limit: 5000,
    unit: 'min',
  },
  {
    id: 'storage',
    label: 'Knowledge base storage',
    value: '1.2 GB',
    used: 1.2,
    limit: 5,
    unit: 'GB',
  },
]

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
      { label: 'Wed', value: 96, byConfidence: { high: 78, review: 12, low: 6 } },
      { label: 'Thu', value: 104, byConfidence: { high: 84, review: 13, low: 7 } },
      { label: 'Fri', value: 112, byConfidence: { high: 91, review: 14, low: 7 } },
      { label: 'Sat', value: 74, byConfidence: { high: 58, review: 10, low: 6 } },
      { label: 'Sun', value: 62, byConfidence: { high: 48, review: 9, low: 5 } },
      { label: 'Mon', value: 108, byConfidence: { high: 87, review: 14, low: 7 } },
      { label: 'Today', value: 128, byConfidence: { high: 104, review: 16, low: 8 } },
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
  { id: 'call-log', label: 'Call Log', href: '/call-log' },
  { id: 'knowledge-base', label: 'Knowledge Base', href: '/knowledge-base' },
  { id: 'agent-builder', label: 'Agent Builder', href: '/agent-builder' },
  { id: 'simulation', label: 'Simulation & Testing', href: '/simulation' },
  {
    id: 'improvement-feed',
    label: 'Improvement Feed',
    href: '/improvement-feed',
    badge: 2,
  },
]

export const footerNav: NavItem[] = [
  { id: 'budget', label: 'Budget', href: '/budget' },
  { id: 'integrations', label: 'Integrations', href: '/integrations' },
  { id: 'settings', label: 'Settings', href: '/settings' },
]

export const supportNav: NavItem[] = [
  { id: 'help', label: 'Help & Contact', href: '/help' },
]

export const mockVendor = {
  name: 'BitnTech',
  tagline: 'AICA is designed and engineered by BitnTech.',
  supportEmail: env.supportEmail,
  supportPhone: env.supportPhone,
  website: 'www.bitntech.com',
  hours: 'Mon–Fri, 8am–7pm ET',
}

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
    excerpt:
      '"Rescheduling requests within 24 hours of an appointment should be routed to the on-call coordinator rather than confirmed automatically."',
  },
  {
    id: 'doc-2',
    title: '2026 Holiday Hours',
    status: 'conflicting',
    updatedAt: new Date(Date.now() - 6 * day).toISOString(),
    sizeLabel: '1 page',
    conflictId: 'conflict-1',
    excerpt:
      '"During the holiday period (Dec 20–Jan 2), all rescheduling requests are confirmed automatically, regardless of notice given."',
  },
  {
    id: 'doc-3',
    title: 'New Patient Intake Packet',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 5 * day).toISOString(),
    sizeLabel: '8 pages',
    excerpt:
      '"New patients should have their insurance card, photo ID, and a list of current medications ready for their first visit."',
  },
  {
    id: 'doc-4',
    title: 'Insurance Providers Accepted',
    status: 'stale',
    updatedAt: new Date(Date.now() - 95 * day).toISOString(),
    sizeLabel: '3 pages',
    excerpt:
      '"We accept Blue Cross, Aetna, Cigna, and UnitedHealthcare. Medicaid is accepted for pediatric patients only."',
  },
  {
    id: 'doc-5',
    title: 'Prescription Refill Policy',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 12 * day).toISOString(),
    sizeLabel: '2 pages',
    excerpt:
      '"Refill requests are confirmed with the pharmacy on file within one business day. Controlled substances always require a callback."',
  },
  {
    id: 'doc-6',
    title: 'Billing & Payment FAQ',
    status: 'fresh',
    updatedAt: new Date(Date.now() - 20 * day).toISOString(),
    sizeLabel: '3 pages',
    excerpt:
      '"Payment plans are available for balances over $200. A card on file is required to enroll."',
  },
  {
    id: 'doc-7',
    title: 'After-Hours Voicemail Script',
    status: 'stale',
    updatedAt: new Date(Date.now() - 140 * day).toISOString(),
    sizeLabel: '1 page',
    excerpt:
      '"You\'ve reached Riverside Family Clinic after hours. For medical emergencies, please hang up and dial 911."',
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

// ---- Agent Builder: the 7-stage guided setup wizard ----

export const mockAgentSetupStages: AgentSetupStage[] = [
  { id: 1, key: 'type', label: 'Type & sub-type', badge: 'Auto-detected' },
  { id: 2, key: 'behaviour', label: 'Bot behaviour', badge: 'Fingerprinted' },
  { id: 3, key: 'flow', label: 'Conversation flow', badge: 'Drafted from calls' },
  { id: 4, key: 'attributes', label: 'Attributes', badge: 'Suggested' },
  { id: 5, key: 'global-flows', label: 'Global flows', badge: 'Always available' },
  { id: 6, key: 'context', label: 'Additional context', badge: 'Indexed' },
  { id: 7, key: 'review', label: 'Review & confirm', badge: 'Simulated' },
]

export const mockLineTypes: LineType[] = [
  { id: 'inbound', label: 'Inbound support & booking', detail: 'Answer, triage, resolve or book', matchPercent: 78 },
  { id: 'sales', label: 'Sales qualification', detail: 'Score, qualify, route to a rep' },
  { id: 'after-hours', label: 'After-hours overflow', detail: "Catch what the team can't", matchPercent: 14 },
  { id: 'outbound', label: 'Outbound follow-up', detail: 'Reminders, confirmations, win-back' },
  { id: 'collections', label: 'Collections & reminders', detail: 'Payment nudges with compliance rails' },
  { id: 'switchboard', label: 'Switchboard & routing', detail: 'Identify and transfer, nothing more' },
]

export const mockSelectedLineType = 'inbound'

export const mockBehaviorSliders: BehaviorSlider[] = [
  { id: 'warmth', label: 'Warmth', value: 72, matched: true },
  { id: 'pace', label: 'Speaking pace', value: 58, matched: true },
  { id: 'verbosity', label: 'Verbosity', value: 34, matched: false },
  { id: 'formality', label: 'Formality', value: 46, matched: true },
  { id: 'persistence', label: 'Persistence on objections', value: 61, matched: true },
]

export const mockBehaviorToggles: BehaviorToggle[] = [
  { id: 'mirror-pace', label: "Mirror the caller's pace", enabled: true },
  { id: 'barge-in', label: 'Allow interruption (barge-in)', enabled: true },
  { id: 'team-phrasing', label: "Use the team's own phrasings", enabled: true },
  { id: 'small-talk', label: 'Light small talk', enabled: false },
]

export const mockAttributeFields: AttributeField[] = [
  { name: 'full_name', type: 'Text', validation: 'Two or more tokens', required: true, capturedAt: 'Greeting', mapsTo: 'Contact.Name' },
  { name: 'mobile', type: 'Phone', validation: 'E.164 + spell-back confirm', required: true, capturedAt: 'Detect intent', mapsTo: 'Contact.Phone' },
  { name: 'patient_ref', type: 'ID', validation: '6 digits, checksum', required: false, capturedAt: 'Detect intent', mapsTo: 'Patient.Ref' },
  { name: 'appt_window', type: 'DateRange', validation: 'Opening hours + provider roster', required: true, capturedAt: 'Book · step 2', mapsTo: 'Event.Slot' },
  { name: 'reason_code', type: 'Enum · 6', validation: 'From intent model, human-reviewable', required: true, capturedAt: 'Automatic', mapsTo: 'Case.Type' },
  { name: 'consent_sms', type: 'Boolean', validation: 'Verbal, timestamped, recorded', required: true, capturedAt: 'Close', mapsTo: 'Contact.OptIn' },
]

export const mockUnmappedAttributes = [
  { label: 'insurance_provider', askedPercent: 61 },
  { label: 'referral_source', askedPercent: 44 },
  { label: 'preferred_clinician', askedPercent: 38 },
]

export const mockGlobalFlows: GlobalFlow[] = [
  { id: 'transfer', label: 'Transfer to a human', detail: 'Warm — 8-second spoken brief + screen pop', enabled: true },
  { id: 'take-message', label: 'Take a message', detail: 'Structured, routed by reason_code', enabled: true },
  { id: 'repeat', label: 'Repeat & spell back', detail: 'On request or low ASR confidence', enabled: true },
  { id: 'hold', label: 'Hold & look-up', detail: 'Ambient audio while a tool call runs', enabled: true },
  { id: 'voicemail', label: 'Voicemail detection', detail: 'Detect machine → leave the right message', enabled: true },
  { id: 'silence', label: 'Silence & hang-up recovery', detail: 'Two prompts, then graceful close + callback', enabled: true },
  { id: 'frustration', label: 'Frustration escalation', detail: 'Sentiment below −0.4 → human, no questions asked', enabled: true },
  { id: 'disclosure', label: 'Compliance disclosure', detail: 'Recording + AI notice within first 8 seconds', enabled: true },
  { id: 'payment', label: 'Secure payment capture', detail: 'PCI-safe DTMF, digits never transcribed', enabled: false },
  { id: 'language', label: 'Language switch mid-call', detail: "Detect and continue in the caller's language", enabled: false },
]

export const mockSetupChanges: string[] = [
  '+ flow  weekend_availability',
  '+ flow  insurance_coverage_q',
  '~ behaviour.verbosity  41 → 34',
  '+ attr  referral_source',
  '~ transfer.hours  Sat added',
]

export const mockPreflightChecks: { label: string; passed: boolean }[] = [
  { label: 'No unreachable nodes in the tree', passed: true },
  { label: 'Required attributes captured on every path', passed: true },
  { label: 'Never-say list: 0 violations in 240 sims', passed: true },
  { label: 'Escalation route present on all branches', passed: true },
  { label: 'PII redaction active on ingest and runtime', passed: true },
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

export const mockLowConfidenceActions: LowConfidenceAction[] = [
  {
    id: 'lca-1',
    callerLabel: 'Caller •• 7723',
    intent: 'Insurance eligibility — Blue Cross',
    confidenceScore: 38,
    timestamp: new Date(Date.now() - 41_000).toISOString(),
    aiAction:
      "Told the caller their plan \"should be covered\" without checking the payer list, then moved on to scheduling.",
    options: [
      {
        id: 'opt-verify',
        label: 'Verify before answering',
        response: 'Check the payer list first, then give a precise yes/no with the plan name attached.',
      },
      {
        id: 'opt-redirect',
        label: 'Redirect instead of guessing',
        response: 'Skip the guess and connect the caller directly to the front desk for insurance questions.',
      },
      {
        id: 'opt-narrow',
        label: 'Narrow the question',
        response: 'Ask which specific plan tier they have so the answer is scoped, not a blanket guess.',
      },
    ],
  },
  {
    id: 'lca-2',
    callerLabel: 'Caller •• 4471',
    intent: 'Billing — itemized charge dispute',
    confidenceScore: 44,
    timestamp: new Date(Date.now() - 5_200_000).toISOString(),
    aiAction:
      "Apologized for the charge but couldn't explain the itemized breakdown, then took a voicemail for the billing team.",
    options: [
      {
        id: 'opt-pull-bill',
        label: 'Pull the itemized bill',
        response: 'Look up the itemized bill through the billing integration and read out each line before offering a callback.',
      },
      {
        id: 'opt-callback',
        label: 'Offer an immediate callback',
        response: 'Skip the explanation attempt and offer a same-day callback from billing up front.',
      },
      {
        id: 'opt-escalate',
        label: 'Escalate live',
        response: 'Recognize a billing dispute past three lines of detail and transfer the caller live instead of taking a message.',
      },
    ],
  },
  {
    id: 'lca-3',
    callerLabel: 'Caller •• 1187',
    intent: 'Prescription refill — controlled substance',
    confidenceScore: 31,
    timestamp: new Date(Date.now() - 9_400_000).toISOString(),
    aiAction:
      'Confirmed the refill request without flagging that it was a controlled substance, then queued it for the pharmacy team.',
    options: [
      {
        id: 'opt-flag',
        label: 'Flag for callback',
        response: 'Detect the controlled-substance flag and require a callback confirmation before queuing the refill.',
      },
      {
        id: 'opt-policy',
        label: 'State the policy up front',
        response: 'Tell the caller controlled substances always need a callback, then take the message.',
      },
    ],
  },
  {
    id: 'lca-4',
    callerLabel: 'Caller •• 9902',
    intent: 'Clinical question — medication dosage',
    confidenceScore: 22,
    timestamp: new Date(Date.now() - 11_000_000).toISOString(),
    aiAction: "Gave a general dosage range from the knowledge base instead of redirecting a clinical question.",
    options: [
      {
        id: 'opt-redirect-clinical',
        label: 'Redirect immediately',
        response: "Never answer dosage questions — redirect to the nurse line the moment it's identified as clinical.",
      },
      {
        id: 'opt-acknowledge-transfer',
        label: 'Acknowledge and transfer',
        response: "Acknowledge the question, explain AICA can't advise on dosage, and transfer live to the nurse line.",
      },
    ],
  },
]

export const mockRoles: Role[] = [
  {
    id: 'admin',
    name: 'Admin',
    description: 'Full control, including publishing agent changes and confidence floors.',
    canDo: ['Publish agent changes', 'Edit confidence floors', 'Manage users', 'Approve improvements'],
    cannotDo: [],
  },
  {
    id: 'reviewer',
    name: 'Reviewer',
    description: 'Reviews calls and approves improvements, no publishing or user control.',
    canDo: ['Tag call outcomes', 'Approve or dismiss improvements', 'Resolve document conflicts'],
    cannotDo: ['Publish agent changes', 'Manage users', 'Edit confidence floors'],
  },
  {
    id: 'read-only',
    name: 'Read-only',
    description: 'Can see everything, change nothing — for auditors and stakeholders.',
    canDo: ['View all dashboards, logs, and transcripts'],
    cannotDo: ['Edit anything', 'Approve or dismiss items', 'Export data'],
  },
]

export const mockUsers: UserAccount[] = [
  { id: 'user-1', name: 'Priya N.', email: 'priya@riversidefamily.example', roleId: 'admin' },
  { id: 'user-2', name: 'Marcus D.', email: 'marcus@riversidefamily.example', roleId: 'reviewer' },
  { id: 'user-3', name: 'Aisha K.', email: 'aisha@riversidefamily.example', roleId: 'read-only' },
]

/** The signed-in account driving the top bar's profile control. */
export const mockCurrentUser: UserAccount = mockUsers[0]

export const mockIntegrations: Integration[] = [
  { id: 'telephony', name: 'Twilio Voice', category: 'Telephony', status: 'connected', detail: 'Receiving calls on (555) 013-0148' },
  { id: 'calendar', name: 'Google Calendar', category: 'Scheduling', status: 'connected', detail: 'Synced 4 provider calendars' },
  { id: 'ehr', name: 'Athenahealth', category: 'EHR', status: 'error', detail: 'Auth token expired — reconnect to resume syncing' },
  { id: 'crm', name: 'HubSpot', category: 'CRM', status: 'disconnected', detail: 'Not connected' },
]
