import { describe, expect, it } from 'vitest'
import { normalizeServerEvent } from '../testCallProtocol'

describe('normalizeServerEvent', () => {
  it('returns null for non-object input', () => {
    expect(normalizeServerEvent('not an event')).toBeNull()
    expect(normalizeServerEvent(null)).toBeNull()
  })

  it('returns null for an unrecognized type', () => {
    expect(normalizeServerEvent({ type: 'something_new' })).toBeNull()
  })

  it('returns null for an event the panel intentionally ignores (e.g. asr_start)', () => {
    expect(normalizeServerEvent({ type: 'asr_start', duration_ms: 400, language: 'ta' })).toBeNull()
  })

  it('normalizes a ready event from the backend\'s flat capability booleans', () => {
    expect(
      normalizeServerEvent({
        type: 'ready',
        connection_id: 'abc-123',
        asr_ready: true,
        conversation_ready: true,
        tts_ready: false,
      }),
    ).toEqual({
      type: 'ready',
      capabilities: { asr: true, llm: true, tts: false },
      connectionId: 'abc-123',
    })
  })

  it('treats missing capability fields on ready as false', () => {
    expect(normalizeServerEvent({ type: 'ready' })).toEqual({
      type: 'ready',
      capabilities: { asr: false, llm: false, tts: false },
      connectionId: '',
    })
  })

  it('normalizes an interim partial_transcript event', () => {
    expect(normalizeServerEvent({ type: 'partial_transcript', text: 'hel' })).toEqual({
      type: 'partial_transcript',
      text: 'hel',
    })
  })

  it('normalizes a final transcript event', () => {
    expect(normalizeServerEvent({ type: 'transcript', text: 'hello', language: 'ta' })).toEqual({
      type: 'transcript',
      text: 'hello',
      language: 'ta',
    })
  })

  it('normalizes agent_speaking_start with a null sample rate when TTS is not ready', () => {
    expect(normalizeServerEvent({ type: 'agent_speaking_start', sample_rate: null })).toEqual({
      type: 'agent_speaking_start',
      sampleRate: null,
    })
  })

  it('normalizes agent_speaking_start with a numeric sample rate', () => {
    expect(normalizeServerEvent({ type: 'agent_speaking_start', sample_rate: 22050 })).toEqual({
      type: 'agent_speaking_start',
      sampleRate: 22050,
    })
  })

  it('normalizes an agent_clause event', () => {
    expect(normalizeServerEvent({ type: 'agent_clause', text: 'Vanakkam.' })).toEqual({
      type: 'agent_clause',
      text: 'Vanakkam.',
    })
  })

  it('normalizes agent_interrupted and agent_speaking_end with no payload', () => {
    expect(normalizeServerEvent({ type: 'agent_interrupted' })).toEqual({ type: 'agent_interrupted' })
    expect(normalizeServerEvent({ type: 'agent_speaking_end' })).toEqual({ type: 'agent_speaking_end' })
  })

  it('normalizes error events with a message', () => {
    expect(normalizeServerEvent({ type: 'protocol_error', message: 'bad frame' })).toEqual({
      type: 'protocol_error',
      message: 'bad frame',
    })
    expect(normalizeServerEvent({ type: 'agent_error', message: 'LLM unavailable' })).toEqual({
      type: 'agent_error',
      message: 'LLM unavailable',
    })
  })
})
