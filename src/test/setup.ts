import '@testing-library/jest-dom/vitest'

/** jsdom has no Web Audio API, but the test-call socket owns a
 * `ChunkedAudioPlayer` (so barge-in cannot be forgotten by a caller), which
 * touches `AudioContext` the moment a binary frame arrives. This is the
 * smallest stub that keeps the player's real code paths running, and it
 * records every scheduled source so a test can assert that barge-in actually
 * called `.stop()` on them — the one behaviour that is silently broken if you
 * only reset the playback clock. */

export class FakeBufferSource {
  static created: FakeBufferSource[] = []
  buffer: { duration: number } | null = null
  started: number | null = null
  stopped = false
  onended: (() => void) | null = null

  constructor() {
    FakeBufferSource.created.push(this)
  }

  connect() {}
  start(at: number) {
    this.started = at
  }
  stop() {
    this.stopped = true
  }
}

class FakeAudioContext {
  currentTime = 0
  state = 'running'
  sampleRate: number

  constructor(options?: { sampleRate?: number }) {
    this.sampleRate = options?.sampleRate ?? 48000
  }

  createBuffer(_channels: number, length: number, rate: number) {
    return { duration: length / rate, copyToChannel: () => {} }
  }
  createBufferSource() {
    return new FakeBufferSource()
  }
  createGain() {
    return { gain: { value: 1 }, connect: (n: unknown) => n, disconnect: () => {} }
  }
  close() {
    return Promise.resolve()
  }
  resume() {
    return Promise.resolve()
  }
  get destination() {
    return {}
  }
}

Object.defineProperty(globalThis, 'AudioContext', { value: FakeAudioContext, writable: true })
