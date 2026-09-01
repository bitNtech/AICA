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

  // The tool layer was removed from the backend, so these are never emitted.
  // They must stay unhandled rather than growing UI that can never fire.
  it('returns null for the retired tool events', () => {
    expect(normalizeServerEvent({ type: 'agent_tool_call', name: 'lookup' })).toBeNull()
    expect(normalizeServerEvent({ type: 'call_control', action: 'hangup' })).toBeNull()
  })

  it('normalizes asr_start', () => {
    expect(normalizeServerEvent({ type: 'asr_start', duration_ms: 400, language: 'ta' })).toEqual({
      type: 'asr_start',
      durationMs: 400,
    })
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

  it('normalizes a final transcript event with its endpointing detail', () => {
    expect(
      normalizeServerEvent({
        type: 'transcript',
        text: 'hello',
        language: 'ta',
        duration_ms: 2140,
        endpoint_reason: 'silence',
      }),
    ).toEqual({
      type: 'transcript',
      text: 'hello',
      language: 'ta',
      durationMs: 2140,
      endpointReason: 'silence',
    })
  })

  it('normalizes the two safety warnings, which must never be swallowed', () => {
    expect(normalizeServerEvent({ type: 'grounding_warning', identifiers: ['MRN-40128'] })).toEqual({
      type: 'grounding_warning',
      identifiers: ['MRN-40128'],
    })
    expect(normalizeServerEvent({ type: 'action_claim_warning', claims: ['dispatched'] })).toEqual({
      type: 'action_claim_warning',
      claims: ['dispatched'],
    })
  })

  // A malformed warning still has to render — an event that means "the agent
  // fabricated something" is the wrong one to drop on a type mismatch.
  it('survives a safety warning with a missing or malformed list', () => {
    expect(normalizeServerEvent({ type: 'grounding_warning' })).toEqual({
      type: 'grounding_warning',
      identifiers: [],
    })
  })

  it('normalizes echo_discarded and agent_audio_error', () => {
    expect(normalizeServerEvent({ type: 'echo_discarded', text: 'its own voice' })).toEqual({
      type: 'echo_discarded',
      text: 'its own voice',
    })
    expect(normalizeServerEvent({ type: 'agent_audio_error', message: 'clause lost' })).toEqual({
      type: 'agent_audio_error',
      message: 'clause lost',
    })
  })

  // pipeline_error is terminal (a 1011 close follows), so the stage that
  // failed is the useful half and must survive into the message.
  it('folds pipeline_error\'s stage into the message', () => {
    expect(normalizeServerEvent({ type: 'pipeline_error', stage: 'vad', message: 'init failed' })).toEqual({
      type: 'pipeline_error',
      message: 'vad: init failed',
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
