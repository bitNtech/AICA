import { describe, expect, it } from 'vitest'
import { arrayBufferToBase64, base64ToArrayBuffer, normalizeServerEvent } from '../testCallProtocol'

describe('normalizeServerEvent', () => {
  it('returns null for non-object input', () => {
    expect(normalizeServerEvent('not an event')).toBeNull()
    expect(normalizeServerEvent(null)).toBeNull()
  })

  it('returns null for an unrecognized type', () => {
    expect(normalizeServerEvent({ type: 'something_new' })).toBeNull()
  })

  it('falls back to asr_ready when capabilities is absent from a ready event', () => {
    expect(normalizeServerEvent({ type: 'ready', asr_ready: true })).toEqual({
      type: 'ready',
      capabilities: { asr: true, llm: false, tts: false },
      asrReady: true,
    })
  })

  it('prefers an explicit capabilities object over asr_ready', () => {
    expect(
      normalizeServerEvent({ type: 'ready', asr_ready: false, capabilities: { asr: true, llm: true, tts: false } }),
    ).toEqual({
      type: 'ready',
      capabilities: { asr: true, llm: true, tts: false },
      asrReady: true,
    })
  })

  it('normalizes a user_transcript event', () => {
    expect(normalizeServerEvent({ type: 'user_transcript', text: 'hello', final: true })).toEqual({
      type: 'user_transcript',
      text: 'hello',
      final: true,
    })
  })

  it('normalizes error events with a message', () => {
    expect(normalizeServerEvent({ type: 'protocol_error', message: 'bad frame' })).toEqual({
      type: 'protocol_error',
      message: 'bad frame',
    })
  })
})

describe('base64 round-trip', () => {
  it('recovers the original bytes', () => {
    const original = new Uint8Array([0, 1, 2, 255, 128, 64]).buffer
    const roundTripped = base64ToArrayBuffer(arrayBufferToBase64(original))
    expect(new Uint8Array(roundTripped)).toEqual(new Uint8Array(original))
  })
})
