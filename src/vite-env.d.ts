/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** WebSocket URL for the backend's `/ws/audio` test-call endpoint. See .env.example. */
  readonly VITE_BACKEND_WS_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
