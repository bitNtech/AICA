import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { loadEnv } from 'vite'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')

  // Vite inlines env vars at build time, so a production bundle built without
  // VITE_BACKEND_WS_URL can never reach a backend — it is baked in wrong, not
  // fixable by setting the var afterwards. Warn loudly in the build log (the
  // console still works on mock data, so this is not worth failing a deploy
  // over). See .env.example.
  if (mode === 'production' && !env.VITE_BACKEND_WS_URL?.trim()) {
    console.warn(
      '\n\u26A0  VITE_BACKEND_WS_URL is not set for this production build.\n' +
        '   Simulation & Testing will show a connection error. Set it in\n' +
        '   Vercel \u2192 Settings \u2192 Environment Variables and redeploy.\n',
    )
  }
  if (mode === 'production' && env.VITE_BACKEND_WS_URL?.trim().startsWith('ws://')) {
    console.warn(
      '\n\u26A0  VITE_BACKEND_WS_URL uses ws://, not wss://. Browsers block\n' +
        '   plaintext WebSockets from an https:// page, so the test call will\n' +
        '   fail to connect once deployed.\n',
    )
  }

  return {
    plugins: [react(), tailwindcss()],
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      css: true,
    },
  }
})
