# AICA — Frontend Master Plan
**AI Caller Agent, health-sector client interface**
*Scope: UI/UX only. Your colleague owns the voice model + backend; this plan assumes the frontend mounts to their API/websocket and focuses entirely on the client experience.*

---

## 0. What this document is

A complete design language + screen-by-screen build plan for AICA's client interface: a dashboard clinics and health practices use to watch their AI caller work, trust it, correct it, and watch it improve. Everything here is meant to be built, not just admired — every section ends in something you can turn into a ticket.

The product truth that should shape every screen: **the person using this is not a developer.** It's a practice manager or clinic admin who has never configured an AI system before and is nervous about a robot talking to their patients. The entire UI's job is to make that feel safe, legible, and controllable — not impressive in a technical sense, impressive in a *"I understand exactly what this thing did and why"* sense.

---

## 1. Visual identity — the token system

### Why not the obvious healthcare look
The instinct for "health sector SaaS" is either sterile hospital-white-and-blue, or the generic AI-startup cream-and-terracotta look everyone's seen a hundred times. AICA should feel like neither a hospital intranet nor a generic AI demo. The brief is voice + health + trust — so the identity is built around **vitals**: the visual language of something alive being monitored carefully. Not literal medical iconography (no stethoscopes, no crosses, no clip-art), but the *rhythm* of a vitals monitor — a calm line that moves because something real is happening behind it.

### Color — 6 named values

| Token | Hex | Role |
|---|---|---|
| `mist` | `#F6F8F8` | Base background — clinical calm, not stark white |
| `ink-teal` | `#0F2B2E` | Primary text, nav rail, deep authority color |
| `pulse` | `#F2604D` | Signature accent — the "vitals" color. Used for live/active states, the waveform, primary CTAs. Used sparingly and deliberately, never as decoration |
| `sage` | `#7FA695` | Secondary accent — success, resolved, healthy states. The only "green" in the palette, muted so it never reads as generic medical green |
| `sand` | `#EDE6DA` | Warm neutral for card surfaces, sitting against `mist` to add warmth without going full cream-and-terracotta |
| `amber` | `#E4A03A` | Warning / needs-review states only |

Dark mode is a real requirement (ops staff monitor live calls in dim back-office rooms) — invert around `ink-teal` as the new background (`#0B1E20`) with `mist` dropping to `#DDE6E4` for text, `pulse` and `sage` unchanged since they're already saturated enough to hold on dark.

### Type — three roles, deliberately paired

- **Display — Fraunces** (soft, rounded-terminal serif). Used only for page titles and the handful of moments that need to feel human and considered, not for UI chrome. Restrained weights (Light/Regular), never bold-and-shouty. This is what keeps the product feeling like it's run by people who care, not a dashboard template.
- **Body / UI — Inter**. Every label, button, nav item, paragraph. Tight, neutral, gets out of the way.
- **Utility / data — IBM Plex Mono**. Timestamps, call IDs, transcript text, confidence scores, code-like values (phone numbers, durations). Monospace signals "this is a precise, logged fact," which matters a lot in a product whose whole pitch is auditability.

Type scale (rem, 16px root): `12 / 14 / 16 / 20 / 26 / 34 / 48`. Display face only ever appears at 26/34/48.

### Layout concept — "the control room"

This is not a marketing site, it's an operational console someone keeps open all day. The layout stays anchored so people build muscle memory:

```
┌─────────┬──────────────────────────────────────┬───────────────┐
│         │  Top bar: page title, live call count, │               │
│  Nav    │  agent status pill, search              │   Context     │
│  rail   ├──────────────────────────────────────┤   drawer      │
│  +      │                                        │   (slides in  │
│  Pulse  │            Main canvas                 │   from right, │
│  ticker │        (page content lives here)       │   never a full│
│         │                                        │   navigation) │
│         │                                        │               │
└─────────┴──────────────────────────────────────┴───────────────┘
```

- **Left rail**: fixed, `ink-teal` background, holds primary nav + a live "pulse ticker" (see signature element below) showing calls-in-progress as small animated waveforms — so agent activity is visible from any screen without opening anything.
- **Main canvas**: `mist` background, cards in `sand`/`white`, this is where 90% of building happens.
- **Right drawer**: the single mechanism for "see more detail without losing your place" — call transcripts, document previews, citation sources, node detail. Never route away from list views; drawer over navigation, everywhere, consistently.

### Signature element — the Pulse Line

One motif, reused everywhere, is the thing that makes this feel designed rather than assembled:

A single animated waveform line that:
- Renders as a **real audio waveform** during live calls (actual amplitude data from the stream)
- Compresses into a **sparkline** on the dashboard for "calls today," "matched-human rate this week"
- Becomes a **soft idle ripple** (slow, low-amplitude, looping) on empty and loading states — the product visually "breathing" instead of showing a static spinner
- Flatlines briefly (a deliberate, single flat beat) as the transition when a call ends — a small, respectful moment rather than an abrupt state swap

This single SVG/canvas component (`<PulseLine mode="live" | "spark" | "idle" | "end" />`) should be built once, early, and reused across the entire product. It's the thing a user will describe when they describe the product to someone else.

### Motion principles
- Page-level transitions: none — instant, console-grade, no fade-ins that make an operator wait.
- Micro-interactions: hover states on cards lift 2px with a soft shadow, 120ms ease-out. Nothing bouncier than that — this is a clinical trust product, not a consumer app.
- The Pulse Line is the only place sustained ambient animation lives. Respect `prefers-reduced-motion` by freezing it to a static waveform snapshot, never removing the element entirely (it still needs to communicate state).

---

## 2. Information architecture

```
AICA
├── Dashboard                      (health-at-a-glance home)
├── Live Calls                     (real-time monitor)
├── Call Log                       (searchable history → Call Detail drawer)
├── Knowledge Base                 (source docs, conflicts, staleness)
├── Agent Builder                  (flow graph, guardrails, coverage)
├── Simulation & Testing           (replay, dual-judge scoring, ghost mode)
├── Rollout                        (staged launch controls, confidence routing)
├── Improvement Feed               (weekly drift → proposed fixes → approve)
├── Data Readiness                 (onboarding + ongoing corpus health score)
├── Compliance & Audit             (PHI redaction, consent, RBAC, logs)
├── Integrations                   (telephony, calendar, CRM/EHR)
└── Settings                       (org, users, billing, notifications)
```

Nav rail shows the first nine (Compliance/Integrations/Settings collapse into a footer group) — this keeps the primary rail to a scannable, health-sector-relevant set.

---

## 3. Screens, in build order of importance

### 3.1 Dashboard — "is my front desk okay right now"
The single most-viewed screen. Must answer three questions in under two seconds: *is the agent handling things, is anything wrong, is it getting better.*

- Hero row: three stat cards — **Calls today**, **Resolved without handoff %**, **Matched-or-beat-human score this week** — each with a Pulse Line sparkline, not a bare number.
- Live activity strip: horizontally scrolling mini-cards of calls currently in progress, each a tiny live waveform + caller-intent label (e.g. "Rescheduling — Rm. 3"), click opens the Live Calls monitor filtered to that call.
- "Needs your attention" panel: escalations, low-confidence calls flagged for review, pending Improvement Feed proposals — this is the trust-building panel, it should never be empty-and-hidden, it should proudly show "0 items" with a calm confirming state when clear.
- Empty/first-run state (before any real call data exists): replaces the whole dashboard with a **Data Readiness** teaser card — "Your agent hasn't taken a call yet. Here's what we know about your practice so far" — turns the cold-start problem into an onboarding moment instead of a blank dashboard.

### 3.2 Live Calls — the real-time monitor
- Left: list of active calls (caller ID/masked number, duration, current intent, confidence badge color-coded `sage`/`amber`/`pulse`).
- Selecting a call opens a live view: real-time transcript scrolling (agent turns in `ink-teal`, caller turns in neutral gray), the live Pulse Line waveform at the top, and a **"why did it say that"** inline citation chip after each agent line — click reveals the flow node or source document in the right drawer. This is the explainability pillar made tangible, and it should be on-screen by default, not a click away.
- A manual **takeover / barge-in** button for staff — big, unambiguous, `pulse`-colored, always visible during a live call. Health-sector buyers will ask about this in the first demo; it needs to feel like a fire alarm pull, not a buried menu item.

### 3.3 Call Log — history and search
- Filterable table (date, outcome tag, duration, confidence, escalated y/n). Monospace for all data columns per the type system.
- Row click → Call Detail in the right drawer: full transcript, outcome tag (editable — this is how staff correct the Outcome-Label Resolver's guesses when CRM data is missing), citation trail, and a "flag for review" action that feeds the Improvement Feed.
- Bulk outcome-tagging tool for early customers with messy CRM exports — a lightweight table view where staff can tag 20 calls quickly. This directly de-risks the biggest backend dependency (outcome-labeled data) and deserves real design attention, not an afterthought form.

### 3.4 Knowledge Base
- Document list with per-doc status chips: `Fresh` (sage), `Stale` (amber), `Conflicting` (pulse) — staleness/conflict detection surfaced as the primary visual signal, not buried in metadata.
- Conflict resolution view: side-by-side of the two contradicting passages with source citations, a single "which is correct" action.
- Upload flow: drag-drop, with a visible ingest pipeline status (`Ingesting → Transcribing/Parsing → Redacting → Indexed`) using a horizontal stepper — makes an otherwise invisible backend process feel accountable.

### 3.5 Agent Builder
- Flow graph canvas (node-and-edge, React Flow is the right library) representing the hybrid state-graph architecture — but the MVP version should render the graph **read-mostly**, generated from ingestion, with inline editing of individual nodes rather than a full drag-to-build canvas. Full visual authoring is a v2 feature, not MVP (see cut list).
- **Coverage meter**: a persistent header bar on this screen showing "% of your call history this agent can currently handle" with a breakdown of unreachable/uncovered nodes listed below — this is one of the product's real differentiators and should never be hidden in a settings tab.
- **Never-say list**: a simple, prominent editable list (chips with an add/remove pattern) — compliance officers in health sector will want to audit this in five seconds, so it should never require more than one click to view in full.
- Per-node detail drawer: which calls trained it, confidence floor, source citations.

### 3.6 Simulation & Testing
- "Run simulation" primary action against a saved config, replaying historical calls.
- Results view: a scored table (matched / beat / worse than human, per the dual-judge system), with a filter to drop into any individual replayed call and see agent-response vs. human-response side by side.
- **Judge calibration panel**: surfaces the human-audit sampling explicitly ("12 of these 240 scores were checked by a person, 11 agreed") — this is the single most important trust-building screen in the whole product, because it's the thing that makes the "91% matched human" number honest instead of marketing. Do not let this get deprioritized.
- **Ghost mode**: a toggle to run the new config silently alongside the live agent without it ever speaking — results stream into this same view tagged "ghost," letting staff build confidence before anything goes live.

### 3.7 Rollout
- Staged rollout slider (e.g. 0% → 10% → 50% → 100% of calls), with the current stage's live matched-human rate shown next to the slider so the decision to advance is data-backed in the same view, not a separate report.
- Confidence-floor routing config: per-intent threshold sliders, below which calls auto-escalate to a human — framed plainly as "hand off when the agent isn't sure," not as a technical parameter.
- One-click rollback, always visible, never nested in a menu — this is the safety net that lets a nervous first-time buyer say yes.

### 3.8 Improvement Feed
- Weekly card feed: "143 callers asked about Saturday slots → drafted fix" style entries, each with a before/after diff and a simple Approve / Dismiss action. This is the retention-driving "agent that gets better every week" moment from the competitive analysis — make it feel like a small win notification, not a changelog.
- Approved items auto-queue into Simulation before going live — the loop should be visibly closed in the UI (a small connecting line/status from Improvement Feed card → Simulation result → Rollout stage).

### 3.9 Data Readiness
- The onboarding-and-ongoing corpus health screen described in the feasibility analysis — score the practice's own call archive/CRM export on outcome-label coverage, volume, and diarization difficulty, and show a calibrated expectation ("your data supports ~70% auto-coverage today") rather than a fixed promise. Build this early; it reframes the biggest technical risk as a transparency feature.
- Progress ring per data source (call archive, CRM/EHR export, document uploads) with plain-language next steps under each.

### 3.10 Compliance & Audit
- PHI/PII redaction settings and a live preview of what gets scrubbed from a sample transcript — critical for health-sector trust, should show real redaction examples, not just a toggle.
- Consent record log (recording consent captured per call, two-party consent state handling).
- Full audit trail table (who changed what node/setting, when) — read-only, exportable, monospace throughout.
- RBAC screen: roles (Admin / Reviewer / Read-only), each with a plain-English description of what they can and can't touch.

### 3.11 Integrations & Settings
- Standard: telephony provider connection status, calendar/EHR connection cards, org/user management, notification preferences. Lower design priority — solid, unglamorous, no signature-element budget spent here.

---

## 4. Component system

Build these as the shared library before wiring up full pages — most screens above are compositions of the same dozen pieces:

- `PulseLine` (live / spark / idle / end modes — the signature element)
- `StatCard` (number + label + optional PulseLine sparkline)
- `ConfidenceBadge` (sage/amber/pulse, with a numeric tooltip)
- `TranscriptView` (turn-by-turn, with inline citation chips)
- `CitationChip` → opens source in the context drawer
- `ContextDrawer` (the single slide-in mechanism used everywhere)
- `CoverageMeter` (progress bar + breakdown list)
- `FlowNode` / `FlowGraph` (React Flow wrapper, read-mostly for MVP)
- `StepperStatus` (ingest pipeline, rollout stages)
- `DiffCard` (before/after, used in Improvement Feed and Simulation)
- `EmptyState` (idle PulseLine + one clear next action — never a bare "no data" message)
- `DataTable` (Call Log, Audit Trail — sortable, monospace data columns)

### Writing/voice rules for every component
- Buttons name the action, not the mechanism: "Send to review," not "Submit." "Roll back," not "Revert config."
- Errors state what happened and what to do, in AICA's voice, never an apology: *"This document conflicts with another source. Choose which one is correct before it's used on live calls."*
- Empty states are an invitation, always paired with a next action: *"No calls yet. Connect your call archive to get started."* — never a bare "No data."

---

## 5. States, responsiveness, accessibility

- Every data view needs four states designed, not just the happy path: **loading** (idle Pulse Line, skeleton rows), **empty** (EmptyState component), **error** (plain explanation + retry), **populated**.
- Primary breakpoint target is desktop/laptop (this is an all-day ops console) with a functional tablet layout (nav rail collapses to icons, drawer becomes full-screen overlay). Phone support is explicitly out of MVP scope — see cut list.
- Visible keyboard focus rings in `pulse` on every interactive element; the manual takeover/barge-in control must be reachable and triggerable via keyboard alone — this is a real operational safety requirement, not just an accessibility checkbox.
- Respect `prefers-reduced-motion` by freezing the Pulse Line to a static snapshot rather than removing it.
- Color is never the only signal — confidence/status always pairs color with a label or icon, important given `sage`/`amber`/`pulse` need to be distinguishable for colorblind users.

---

## 6. Suggested stack

- **React + TypeScript**, Vite.
- **Tailwind**, tokens above wired in as CSS variables/theme extension — never hardcode hex values in components.
- **shadcn/ui** as the base primitive layer (dialogs, dropdowns, tables) — restyled with the token system, not used stock.
- **React Flow** for the Agent Builder graph.
- **Recharts** for Improvement Feed / Simulation charts; the PulseLine component itself is hand-built SVG/Canvas, not a charting-library output — it's the signature element and needs full control.
- **WebSocket (or SSE)** connection for Live Calls — design every live component to degrade gracefully to a "reconnecting" state, since this is a real-time product staff will be watching during actual patient calls.
- **Zustand** or React Query for state — React Query specifically for the API-backed views (Call Log, Knowledge Base), since most of this product is "server state with light client interaction."
- Mock the backend with realistic fixture data (fake calls, transcripts, a fake improvement feed) so frontend work isn't blocked waiting on your colleague's model — build the API contract as a shared TypeScript types file both of you commit to early.

---

## 7. Build phases (frontend only)

1. **Foundation** — token system in Tailwind config, `PulseLine` and core component library, app shell (nav rail + top bar + drawer mechanism), mock data layer.
2. **Trust core** — Dashboard, Live Calls, Call Log + Call Detail drawer. This is the demoable MVP slice; get this pixel-right before anything else.
3. **Knowledge & Builder** — Knowledge Base, Agent Builder (read-mostly graph + coverage meter + never-say list).
4. **Proof loop** — Simulation & Testing (including judge calibration panel and ghost mode), Rollout controls. This is the credibility engine from the feasibility analysis — do not compress this phase.
5. **Improvement & trust infrastructure** — Improvement Feed, Data Readiness, Compliance & Audit.
6. **Polish pass** — Integrations, Settings, empty/error/loading states audited across every screen, dark mode, accessibility pass, motion QA.

---

## 8. Cut list — explicitly out of MVP scope

State these out loud so scope creep has something to point at:

- Full drag-to-build visual flow authoring (ship read-mostly graph + node editing instead)
- Native mobile app / phone-optimized layout
- Multi-language UI (health-sector English MVP first)
- Cross-tenant/benchmark analytics ("how you compare to other clinics")
- In-app voice cloning/persona configuration UI (legal surface too large for MVP; backend flag only, no frontend controls yet)
- Custom dashboard/report builder — ship the fixed Dashboard layout above, revisit customization later
