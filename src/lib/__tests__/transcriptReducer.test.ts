import { describe, expect, it } from 'vitest'
import {
  emptyTranscript,
  reduceTranscript,
  replayTranscript,
  type TranscriptEvent,
  type TranscriptState,
} from '../transcriptReducer'
import { normalizeServerEvent } from '../testCallProtocol'

/** Feeds a sequence through the reducer with a fake clock, so latency
 * assertions are exact instead of timing-dependent. */
function run(events: [TranscriptEvent, number?][], from: TranscriptState = emptyTranscript) {
  return events.reduce((state, [event, now]) => reduceTranscript(state, event, now ?? 0), from)
}

const texts = (state: TranscriptState) => state.rows.map((r) => `${r.kind}:${r.text}`)

describe('reduceTranscript', () => {
  it('grows one agent bubble across clauses instead of one row per clause', () => {
    const state = run([
      [{ type: 'agent_speaking_start', sampleRate: 24000 }],
      [{ type: 'agent_clause', text: 'Vanakkam.' }],
      [{ type: 'agent_clause', text: 'How can I help?' }],
      [{ type: 'agent_speaking_end' }],
    ])

    expect(texts(state)).toEqual(['agent:Vanakkam. How can I help?'])
  })

  it('does not open a bubble on agent_speaking_start — a turn can produce no speech', () => {
    const state = run([
      [{ type: 'agent_speaking_start', sampleRate: null }],
      [{ type: 'agent_speaking_end' }],
    ])

    expect(state.rows).toEqual([])
  })

  it('replaces the interim caller bubble in place and never commits it', () => {
    const state = run([
      [{ type: 'partial_transcript', text: 'ஒன்பது' }],
      [{ type: 'partial_transcript', text: 'ஒன்பது எட்டு' }],
      [{ type: 'transcript', text: 'ஒன்பது எட்டு நான்கு', language: 'ta', durationMs: 2140, endpointReason: 'silence' }],
    ])

    expect(state.interim).toBeNull()
    expect(texts(state)).toEqual(['caller:ஒன்பது எட்டு நான்கு'])
    expect(state.rows[0].meta).toBe('2140 ms audio · silence')
  })

  // ~39% of VAD opens on real calls contain no speech. Rendering them would
  // fill the transcript with empty caller bubbles.
  it('drops an empty transcript instead of adding a blank caller bubble', () => {
    const state = run([
      [{ type: 'partial_transcript', text: 'hm' }],
      [{ type: 'transcript', text: '', language: 'ta', durationMs: 300, endpointReason: 'quiet' }],
    ])

    expect(state.rows).toEqual([])
    expect(state.interim).toBeNull()
  })

  it('measures time-to-first-clause from the caller turn, not from the socket', () => {
    const state = run([
      [{ type: 'transcript', text: 'hello', language: 'ta', durationMs: 900, endpointReason: 'silence' }, 1000],
      [{ type: 'agent_speaking_start', sampleRate: 24000 }, 1500],
      [{ type: 'agent_clause', text: 'Sure.' }, 2400],
      [{ type: 'agent_clause', text: 'One moment.' }, 3000],
      [{ type: 'agent_speaking_end' }, 4200],
    ])

    // First clause at 2400 against a turn that started at 1000.
    expect(state.replyMs).toBe(1400)
    expect(state.rows[1].meta).toBe('first clause 1.4s · turn 3.2s')
  })

  it('starts the reply clock for a typed turn, which gets no transcript event', () => {
    const state = run([
      [{ type: 'local_user_text', text: 'Book me in' }, 500],
      [{ type: 'agent_clause', text: 'Certainly.' }, 2000],
    ])

    expect(state.replyMs).toBe(1500)
    expect(texts(state)).toEqual(['caller:Book me in', 'agent:Certainly.'])
  })

  // The unprompted greeting arrives before the caller has said anything, so
  // there is no turn to measure it against.
  it('leaves the greeting unmeasured rather than inventing a latency', () => {
    const state = run([
      [{ type: 'agent_speaking_start', sampleRate: 24000 }, 100],
      [{ type: 'agent_clause', text: 'Vanakkam.' }, 900],
      [{ type: 'agent_speaking_end' }, 1500],
    ])

    expect(state.replyMs).toBeNull()
    expect(state.rows[0].meta).toBeUndefined()
  })

  it('marks a barged-in reply as truncated and notes the interruption', () => {
    const state = run([
      [{ type: 'agent_speaking_start', sampleRate: 24000 }],
      [{ type: 'agent_clause', text: 'Your appointment is on' }],
      [{ type: 'agent_interrupted' }],
    ])

    expect(state.rows[0].truncated).toBe(true)
    expect(state.speaking).toBe(false)
    expect(texts(state)).toContain('system:Agent was interrupted.')
  })

  // The backend repeats this exact error once per turn while TTS is down.
  it('collapses the repeated TTS-unavailable error into a single latched flag', () => {
    const message =
      'TTS is unavailable, so agent replies are text-only. Check TTS_ENGINE and the server log for the load() failure.'
    const state = run([
      [{ type: 'agent_error', message }],
      [{ type: 'agent_error', message }],
      [{ type: 'agent_error', message }],
    ])

    expect(state.ttsDown).toBe(true)
    expect(state.rows).toEqual([])
  })

  it('still surfaces a genuine agent error as a row', () => {
    const state = run([[{ type: 'agent_error', message: 'LLM request timed out' }]])
    expect(texts(state)).toEqual(['error:LLM request timed out'])
  })

  it('renders both safety warnings distinctly and names the failure', () => {
    const state = run([
      [{ type: 'grounding_warning', identifiers: ['MRN-40128'] }],
      [{ type: 'action_claim_warning', claims: ['dispatched an ambulance'] }],
    ])

    expect(state.rows[0].kind).toBe('ungrounded')
    expect(state.rows[0].text).toContain('MRN-40128')
    expect(state.rows[0].text).toContain('fabrication')
    expect(state.rows[1].kind).toBe('notdone')
    expect(state.rows[1].text).toContain('Nothing actually happened')
  })

  it('flags a 4401 close as an auth rejection, not an ordinary disconnect', () => {
    const state = run([[{ type: 'closed', code: 4401, message: 'Rejected by the backend: bad or missing token.' }]])

    expect(state.unauthorized).toBe(true)
    expect(state.rows[0].kind).toBe('error')
  })

  it('clears everything on reset, because a new call is a new socket', () => {
    const state = run([
      [{ type: 'agent_clause', text: 'Hello' }],
      [{ type: 'reset' }],
    ])
    expect(state).toEqual(emptyTranscript)
  })
})

describe('replayTranscript', () => {
  // The persisted events are the same JSON that went over the socket — that
  // is the whole reason history and live share one reducer.
  it('renders stored backend events through the live reducer', () => {
    const state = replayTranscript(
      [
        { type: 'ready', connection_id: 'abc', asr_ready: true, conversation_ready: true, tts_ready: true },
        { type: 'transcript', text: 'Book me in', language: 'ta', duration_ms: 1200, endpoint_reason: 'silence' },
        { type: 'agent_speaking_start', sample_rate: 24000 },
        { type: 'agent_clause', text: 'Of course.' },
        { type: 'agent_speaking_end' },
      ],
      normalizeServerEvent,
    )

    expect(texts(state)).toEqual(['caller:Book me in', 'agent:Of course.'])
  })

  it('shows no timings for replayed turns rather than inventing them', () => {
    const state = replayTranscript(
      [
        { type: 'transcript', text: 'hi', language: 'ta', duration_ms: 100, endpoint_reason: 'silence' },
        { type: 'agent_clause', text: 'Hello.' },
        { type: 'agent_speaking_end' },
      ],
      normalizeServerEvent,
    )

    expect(state.replyMs).toBeNull()
    expect(state.rows[1].meta).toBeUndefined()
  })
})
