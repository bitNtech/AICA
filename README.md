# AICA

The admin dashboard for AICA — an AI front-desk attendant that answers inbound calls, handles
minimal front-desk tasks itself (scheduling, hours, simple intake), and redirects anything past
that scope to staff. React 19 + TypeScript + Vite + Tailwind v4 + Zustand + `@xyflow/react`.

Most of the app (Dashboard, Call Log, Knowledge Base, Agent Builder, Budget, Integrations,
Settings) runs on fixture data in [`src/data/mock.ts`](src/data/mock.ts) — there is no backend
integration for those yet. The one page that talks to a real backend is **Simulation & Testing →
Run simulation**, which opens `DirectTestingPanel`: a manual one-on-one test call against the
agent backend's `/ws/audio` WebSocket contract.

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

| Variable | Used by | Default |
| --- | --- | --- |
| `VITE_BACKEND_WS_URL` | `DirectTestingPanel` (Simulation & Testing) | none — required to run a real test call |

Copy [`.env.example`](.env.example) to `.env` and point it at a running backend instance. Without
it, the testing panel shows a connection error rather than silently falling back to mocked
replies.

## Two "frontends"

This repo is the admin dashboard. The backend repo also ships its own minimal browser test
harness (a plain HTML/JS page used to exercise `/ws/audio` directly, independent of this
dashboard) — if you're looking for AICA's actual UI, this repo is it; that page is just a
debugging tool for the backend team.

## Testing

Vitest + React Testing Library. Tests live alongside the code they cover (`__tests__/` folders).
Coverage today is the pure utilities in `src/lib/` and the `useTestCallSocket` hook (exercised
against a fake `WebSocket`, not a real backend). CI (`.github/workflows/ci.yml`) runs lint,
typecheck, tests, and a production build on every push and PR.
