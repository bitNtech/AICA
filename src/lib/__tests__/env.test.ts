import { describe, expect, it } from 'vitest'
import { ENV_DEFAULTS, readEnv } from '../env'

describe('readEnv', () => {
  it('falls back to defaults when nothing is configured', () => {
    const env = readEnv({})
    expect(env.backendWsUrl).toBeUndefined()
    expect(env.backendWsToken).toBeUndefined()
    expect(env.callLanguage).toBe(ENV_DEFAULTS.callLanguage)
    expect(env.audioSampleRate).toBe(ENV_DEFAULTS.audioSampleRate)
    expect(env.supportEmail).toBe(ENV_DEFAULTS.supportEmail)
  })

  // The backend serves the socket and the REST API from one process, so
  // configuring both would be two chances to get one host wrong.
  describe('backendHttpUrl', () => {
    it('derives the REST origin from the socket URL', () => {
      expect(readEnv({ VITE_BACKEND_WS_URL: 'ws://localhost:8000/ws/audio' }).backendHttpUrl).toBe(
        'http://localhost:8000',
      )
      expect(readEnv({ VITE_BACKEND_WS_URL: 'wss://api.example.com/ws/audio' }).backendHttpUrl).toBe(
        'https://api.example.com',
      )
    })

    it('treats a relative socket path as same-origin, which needs no base', () => {
      expect(readEnv({ VITE_BACKEND_WS_URL: '/ws/audio' }).backendHttpUrl).toBe('')
    })

    it('prefers an explicit override, without a trailing slash', () => {
      expect(
        readEnv({
          VITE_BACKEND_WS_URL: 'ws://localhost:8000/ws/audio',
          VITE_BACKEND_HTTP_URL: 'https://api.example.com/',
        }).backendHttpUrl,
      ).toBe('https://api.example.com')
    })

    it('is undefined when nothing is configured, so callers can say so', () => {
      expect(readEnv({}).backendHttpUrl).toBeUndefined()
      expect(readEnv({ VITE_BACKEND_WS_URL: 'not a url' }).backendHttpUrl).toBeUndefined()
    })
  })

  it('reads configured values, trimming stray whitespace', () => {
    const env = readEnv({
      VITE_BACKEND_WS_URL: ' wss://api.example.com/ws/audio ',
      VITE_BACKEND_WS_TOKEN: 'shared-secret',
      VITE_CALL_LANGUAGE: 'en',
      VITE_AUDIO_SAMPLE_RATE: '24000',
      VITE_SUPPORT_EMAIL: 'desk@clinic.example',
      VITE_SUPPORT_PHONE: '+91 44 4000 1234',
    })
    expect(env.backendWsUrl).toBe('wss://api.example.com/ws/audio')
    expect(env.backendWsToken).toBe('shared-secret')
    expect(env.callLanguage).toBe('en')
    expect(env.audioSampleRate).toBe(24000)
    expect(env.supportEmail).toBe('desk@clinic.example')
    expect(env.supportPhone).toBe('+91 44 4000 1234')
  })

  // A bare `VAR=` in .env, or an empty field in the Vercel dashboard, arrives
  // as '' — it must fall back, not become an empty URL or a 0Hz AudioContext.
  it('treats blank values as unset', () => {
    const env = readEnv({
      VITE_BACKEND_WS_URL: '   ',
      VITE_BACKEND_WS_TOKEN: '',
      VITE_CALL_LANGUAGE: '',
      VITE_SUPPORT_EMAIL: ' ',
    })
    expect(env.backendWsUrl).toBeUndefined()
    expect(env.backendWsToken).toBeUndefined()
    expect(env.callLanguage).toBe(ENV_DEFAULTS.callLanguage)
    expect(env.supportEmail).toBe(ENV_DEFAULTS.supportEmail)
  })

  it.each(['0', '-16000', 'abc', '16000.5'])(
    'rejects %s as a sample rate and keeps the default',
    (raw) => {
      expect(readEnv({ VITE_AUDIO_SAMPLE_RATE: raw }).audioSampleRate).toBe(
        ENV_DEFAULTS.audioSampleRate,
      )
    },
  )
})
