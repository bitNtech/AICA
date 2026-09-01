/// <reference types="vite/client" />

/** Mirrors `RawEnv` in `src/lib/env.ts` — read config through `env` from
 * there, not through `import.meta.env`. Documented in `.env.example`. */
interface ImportMetaEnv {
  /** WebSocket URL for the backend's `/ws/audio` test-call endpoint. */
  readonly VITE_BACKEND_WS_URL?: string
  /** Origin for the backend's REST API (`/api/health`, `/api/calls`). Derived
   * from `VITE_BACKEND_WS_URL` when unset — set it only if they differ. */
  readonly VITE_BACKEND_HTTP_URL?: string
  /** Shared secret sent as `?token=` when the backend sets `AUDIO_WS_AUTH_TOKEN`. */
  readonly VITE_BACKEND_WS_TOKEN?: string
  /** Language code sent in `call_started` (default `ta`). */
  readonly VITE_CALL_LANGUAGE?: string
  /** Mic capture + playback rate in Hz (default `16000`). */
  readonly VITE_AUDIO_SAMPLE_RATE?: string
  /** Support address shown on Help & Contact. */
  readonly VITE_SUPPORT_EMAIL?: string
  /** Support phone number shown on Help & Contact. */
  readonly VITE_SUPPORT_PHONE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
