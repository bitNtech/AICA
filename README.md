# AICA

The admin dashboard for AICA — an AI front-desk attendant that answers inbound calls, handles
minimal front-desk tasks itself (scheduling, hours, simple intake), and redirects anything past
that scope to staff. React 19 + TypeScript + Vite + Tailwind v4 + Zustand + `@xyflow/react`.

Most of the app (Dashboard, Call Log, Knowledge Base, Agent Builder, Budget, Integrations,
Settings) runs on fixture data in [`src/data/mock.ts`](src/data/mock.ts) — there is no backend
integration for those yet. The one page that talks to a real backend is **Simulation & Testing →
Run simulation**, which opens `DirectTestingPanel`: a manual one-on-one test call against the
agent backend's `/ws/audio` WebSocket contract, plus its `/api/health` and `/api/calls` REST
endpoints.

What that panel does, and why it is shaped the way it is:

- **Status pills, always visible.** ASR, the conversation manager, the LLM and TTS load
  independently on the backend and any of them can fail without stopping the server, so a 200 is
  not evidence the pipeline is whole. Each pill has three states — on, off, and *unknown* (grey,
  before anything authoritative has answered). Sourced from `/api/health` on mount, then
  overwritten by the socket's `ready` event, which wins.
- **A reply meter.** Time from the caller's turn to the agent's first clause. It is the number
  that separates "the model unloaded" from "the prompt is being re-evaluated cold" from "TTS is
  stalling", and on CPU it ranges from ~1.3 s to 15 s.
- **Typed turns as a first-class input, not a debug affordance.** `user_text` skips VAD and ASR
  and drives the identical conversation → LLM → TTS path, so it is the path that works on a
  machine with no speech model installed. Sample turns cover every intent plus the emergency
  override, which is how someone who does not speak the call language can exercise the agent.
- **Real barge-in.** `vad_start` silences playback immediately. This lives in
  `useTestCallSocket`, not in the panel, because it has to be unconditional — and because
  stopping playback means calling `.stop()` on every scheduled buffer, not just resetting the
  clock: a buffer whose start time is still in the future has already been handed to the audio
  device and will play regardless.
- **The two safety warnings are rendered, never swallowed.** `grounding_warning` means the agent
  stated an identifier no lookup returned; `action_claim_warning` means it told the caller
  something was done and nothing did it. They are styled distinctly and worded to name the
  failure.
- **Replayable history.** `/api/calls` lists recent calls and each one replays through the exact
  same reducer the live socket uses ([`transcriptReducer.ts`](src/lib/transcriptReducer.ts)) —
  one rendering path, so history cannot drift from live, and a dropped socket is survivable.

### CORS

The socket and the REST API are treated differently by the browser: CORS applies to `fetch` but
not to WebSockets. So test calls can connect and stream perfectly while the health pills stay
grey and the call log stays empty. Either set `CORS_ORIGINS` on the backend to this frontend's
origin, or serve both behind one proxy and point `VITE_BACKEND_WS_URL` at a relative path
(`/ws/audio`), which makes everything same-origin. The panel degrades to the socket alone if
neither is done.

The Python/FastAPI backend that powers that contract lives on the separate
[`backend`](../../tree/backend) branch — see its README/SETUP.md for running it locally.

## Setup

```bash
npm install
cp .env.example .env   # point VITE_BACKEND_WS_URL at your backend
npm run dev
```

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Typecheck (`tsc -b`) and build for production |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm run typecheck` | `tsc -b` only |
| `npm run test` | Run the Vitest suite once |
| `npm run test:watch` | Vitest in watch mode |

## Environment variables

Every setting lives in `.env` and is read in exactly one place —
[`src/lib/env.ts`](src/lib/env.ts). Nothing else in the app touches
`import.meta.env`, so that file is the whole configuration surface.

| Variable | Used by | Default |
| --- | --- | --- |
| `VITE_BACKEND_WS_URL` | Test call socket (Simulation & Testing) | none — required for a live test call |
| `VITE_BACKEND_HTTP_URL` | `/api/health` and `/api/calls` | derived from `VITE_BACKEND_WS_URL` |
| `VITE_BACKEND_WS_TOKEN` | Test call handshake, sent as `?token=` | unset — only when the backend sets `AUDIO_WS_AUTH_TOKEN` |
| `VITE_CALL_LANGUAGE` | Which language the call's picker starts on | `ta` |
| `VITE_AUDIO_SAMPLE_RATE` | Mic capture, in Hz | `16000` |
| `VITE_SUPPORT_EMAIL` | Help & Contact | `support@bitntech.com` |
| `VITE_SUPPORT_PHONE` | Help & Contact | `+1 (415) 555-0148` |

Copy [`.env.example`](.env.example) to `.env` — it documents each key, its
production form, and what breaks when it is wrong. Without
`VITE_BACKEND_WS_URL` the rest of the console still runs on fixture data; the
testing panel shows a connection error rather than silently faking replies.

`VITE_CALL_LANGUAGE` and `VITE_AUDIO_SAMPLE_RATE` are contract values — they
must match what the backend's ASR actually loaded and expects. A sample-rate
mismatch does not error, it just garbles the audio; `startMicCapture` asserts
the browser actually opened the mic at the configured rate and refuses rather
than streaming audio the backend will transcribe as noise. The *playback* rate
is not configured at all — it is read from `agent_speaking_start`, since it
depends on which TTS engine the backend loaded.

### Deploying (Vercel)

Vite **inlines** `VITE_*` values into the bundle at build time, so they ship to
every visitor — never put a real secret in one — and a build made without them
cannot be fixed by setting them afterwards. `.env` is gitignored and is not
uploaded, so set the same keys in **Project → Settings → Environment
Variables**, then redeploy.

In production `VITE_BACKEND_WS_URL` must use `wss://`, not `ws://`: browsers
refuse plaintext WebSockets from an `https://` page. `npm run build` warns in
the build log when the variable is missing or still `ws://`.

## Testing

Vitest + React Testing Library. Tests live alongside the code they cover (`__tests__/` folders).
Coverage today is the pure utilities in `src/lib/` and the `useTestCallSocket` hook (exercised
against a fake `WebSocket`, not a real backend). CI (`.github/workflows/ci.yml`) runs lint,
typecheck, tests, and a production build on every push and PR.
