/** Deploy-time configuration, read once from Vite's `import.meta.env`.
 *
 * Everything that differs between a laptop, staging and production lives in
 * `.env` (see `.env.example`) and is parsed here — no other module touches
 * `import.meta.env` directly, so there is one place to look when a deploy
 * misbehaves. Vite inlines these at build time: every value here ships in the
 * client bundle, so none of them may hold a real secret. */

/** Just the `VITE_*` keys this app reads — declared separately from
 * `ImportMetaEnv` so tests can call `readEnv({ ... })` with a plain object. */
export interface RawEnv {
  VITE_BACKEND_WS_URL?: string
  VITE_BACKEND_HTTP_URL?: string
  VITE_BACKEND_WS_TOKEN?: string
  VITE_CALL_LANGUAGE?: string
  VITE_AUDIO_SAMPLE_RATE?: string
  VITE_SUPPORT_EMAIL?: string
  VITE_SUPPORT_PHONE?: string
}

/** Blank and whitespace-only values count as unset — a bare `VAR=` left in a
 * `.env`, or an empty field in the Vercel dashboard, must fall back to the
 * default rather than become the empty string. */
function text(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

/** The REST origin (`/api/health`, `/api/calls`) that pairs with the socket.
 * The backend serves both from one process, so it is derived from the WS URL
 * rather than configured twice: `ws://host:8000/ws/audio` → `http://host:8000`.
 * Override with `VITE_BACKEND_HTTP_URL` only when the two genuinely differ.
 * A relative WS path (`/ws/audio`, behind a dev-server proxy) yields `''` —
 * same-origin, which is what a bare `fetch('/api/health')` already does. */
function httpBaseFrom(wsUrl: string | undefined): string | undefined {
  if (!wsUrl) return undefined
  if (wsUrl.startsWith('/')) return ''
  try {
    return new URL(wsUrl.replace(/^ws/, 'http')).origin
  } catch {
    return undefined
  }
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number(text(value))
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

export const ENV_DEFAULTS = {
  callLanguage: 'ta',
  audioSampleRate: 16000,
  supportEmail: 'support@bitntech.com',
  supportPhone: '+1 (415) 555-0148',
} as const

export function readEnv(raw: RawEnv) {
  return {
    /** `wss://host/ws/audio` in production. Unset ⇒ the test-call panel says
     * so instead of dialling nowhere. */
    backendWsUrl: text(raw.VITE_BACKEND_WS_URL),
    /** Sent as `?token=` on the handshake when the backend has
     * `AUDIO_WS_AUTH_TOKEN` set. Not a secret once built — see above. */
    /** REST origin for `/api/health` and `/api/calls` — see `httpBaseFrom`.
     * These are cross-origin GETs, so the backend needs `CORS_ORIGINS` set (or
     * a same-origin proxy); the socket itself is unaffected by CORS. */
    backendHttpUrl:
      text(raw.VITE_BACKEND_HTTP_URL)?.replace(/\/+$/, '') ?? httpBaseFrom(text(raw.VITE_BACKEND_WS_URL)),
    backendWsToken: text(raw.VITE_BACKEND_WS_TOKEN),
    /** Language code sent in `call_started`; must be one the backend's ASR loaded. */
    callLanguage: text(raw.VITE_CALL_LANGUAGE) ?? ENV_DEFAULTS.callLanguage,
    /** Mic capture + playback rate. Must match the backend's ASR input rate. */
    audioSampleRate: positiveInt(raw.VITE_AUDIO_SAMPLE_RATE, ENV_DEFAULTS.audioSampleRate),
    /** Shown on Help & Contact — the real desk that answers, per deployment. */
    supportEmail: text(raw.VITE_SUPPORT_EMAIL) ?? ENV_DEFAULTS.supportEmail,
    supportPhone: text(raw.VITE_SUPPORT_PHONE) ?? ENV_DEFAULTS.supportPhone,
  }
}

export const env = readEnv(import.meta.env)
