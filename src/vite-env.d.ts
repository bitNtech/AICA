/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL for the backend's `/ws/audio` test-call endpoint. See .env.example. */
  readonly VITE_BACKEND_WS_URL?: string
  /** Optional shared-secret sent as `?token=` when the backend sets AUDIO_WS_AUTH_TOKEN. See .env.example. */
  readonly VITE_BACKEND_WS_TOKEN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
