import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTestCallSocket } from '../useTestCallSocket'
import type { ServerEvent } from '../testCallProtocol'
import { FakeBufferSource } from '../../test/setup'

/** A fake WebSocket standing in for a real backend session — mirrors the
 * backend repo's own pattern of testing orchestration logic against a fake
 * client rather than a real socket/model. Supports both JSON text frames
 * and raw binary frames since the real `/ws/audio` contract uses both
 * (mic audio up, TTS audio down, as raw PCM16 — never base64/JSON). */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  binaryType = 'blob'
  sent: (string | ArrayBuffer)[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string | ArrayBuffer }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: ((event: { code: number }) => void) | null = null

  url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string | ArrayBuffer) {
    this.sent.push(data)
  }

  close() {
    this.simulateClose(1000)
  }

  /** Server-side close. 4401 is the backend's auth rejection, sent before
   * `accept()`, so it arrives without the socket ever having opened. */
  simulateClose(code: number) {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.({ code })
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
  }

  simulateBinaryMessage(buffer: ArrayBuffer) {
    this.onmessage?.({ data: buffer })
  }
}

describe('useTestCallSocket', () => {
  beforeEach(() => {
    FakeWebSocket.instances = []
    vi.stubGlobal('WebSocket', FakeWebSocket)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends call_started with the pcm_s16le contract on open', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test/ws/audio', language: 'ta' }))

    act(() => result.current.connect())
    expect(result.current.connectionState).toBe('connecting')

    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    expect(result.current.connectionState).toBe('connected')
    expect(socket.sent).toHaveLength(1)
    expect(JSON.parse(socket.sent[0] as string)).toEqual({
      type: 'call_started',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      channels: 1,
      language: 'ta',
    })
  })

  it('sets binaryType to arraybuffer so TTS audio frames arrive decoded', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())

    expect(FakeWebSocket.instances[0].binaryType).toBe('arraybuffer')
  })

  it('appends a token query param when one is configured', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test/ws/audio', token: 'secret' }))
    act(() => result.current.connect())

    expect(FakeWebSocket.instances[0].url).toBe('ws://test/ws/audio?token=secret')
  })

  it('captures declared capabilities from the backend\'s flat ready booleans', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() =>
      socket.simulateMessage({
        type: 'ready',
        connection_id: 'abc',
        asr_ready: true,
        conversation_ready: false,
        tts_ready: false,
      }),
    )

    expect(result.current.capabilities).toEqual({ asr: true, llm: false, tts: false })
  })

  it('forwards normalized server events to onEvent', () => {
    const events: ServerEvent[] = []
    const { result } = renderHook(() =>
      useTestCallSocket({ url: 'ws://test', onEvent: (e) => events.push(e) }),
    )
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => socket.simulateMessage({ type: 'agent_clause', text: 'Thanks for calling.' }))

    expect(events).toEqual([{ type: 'agent_clause', text: 'Thanks for calling.' }])
  })

  it('forwards binary frames as an agent_audio_chunk event carrying the raw buffer', () => {
    const events: ServerEvent[] = []
    const { result } = renderHook(() =>
      useTestCallSocket({ url: 'ws://test', onEvent: (e) => events.push(e) }),
    )
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    const audio = new Uint8Array([1, 2, 3, 4]).buffer
    act(() => socket.simulateBinaryMessage(audio))

    expect(events).toEqual([{ type: 'agent_audio_chunk', audio }])
  })

  // Barge-in is the one behaviour that fails silently: a buffer whose start
  // time is in the future has already been handed to the audio device, so
  // resetting the playback clock leaves the agent talking over the caller.
  // The hook owns the player precisely so no consumer can forget this.
  it('stops every scheduled audio source when the caller starts talking', () => {
    FakeBufferSource.created = []
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => socket.simulateMessage({ type: 'agent_speaking_start', sample_rate: 24000 }))
    act(() => socket.simulateBinaryMessage(new Int16Array([1, 2, 3, 4]).buffer))
    act(() => socket.simulateBinaryMessage(new Int16Array([5, 6, 7, 8]).buffer))

    expect(FakeBufferSource.created).toHaveLength(2)
    expect(FakeBufferSource.created.every((s) => s.stopped)).toBe(false)

    act(() => socket.simulateMessage({ type: 'vad_start', probability: 0.9 }))

    expect(FakeBufferSource.created.every((s) => s.stopped)).toBe(true)
  })

  it('reports a 4401 close as an auth rejection rather than a plain disconnect', () => {
    const events: ServerEvent[] = []
    const { result } = renderHook(() =>
      useTestCallSocket({ url: 'ws://test', token: 'wrong', onEvent: (e) => events.push(e) }),
    )
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]

    act(() => socket.simulateClose(4401))

    expect(result.current.connectionState).toBe('error')
    expect(result.current.errorMessage).toMatch(/token/i)
    expect(events.at(-1)).toMatchObject({ type: 'closed', code: 4401 })
  })

  // A second `call_started` on the same socket is a protocol error, and each
  // extra socket gets its own greeting playing over the other. StrictMode's
  // double-invoked effects make this a real failure mode, not a theoretical one.
  it('ignores a re-entrant connect instead of opening a second call', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    act(() => result.current.connect())

    expect(FakeWebSocket.instances).toHaveLength(1)
  })

  it('surfaces backend error events as errorMessage', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => socket.simulateMessage({ type: 'pipeline_error', message: 'ASR model not loaded' }))

    expect(result.current.errorMessage).toBe('ASR model not loaded')
  })

  it('only sends text once the socket is open', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]

    act(() => result.current.sendText('hello before open'))
    expect(socket.sent).toHaveLength(0)

    act(() => socket.simulateOpen())
    act(() => result.current.sendText('hello'))

    const sentTexts = socket.sent.filter((m): m is string => typeof m === 'string')
    expect(sentTexts.some((m) => JSON.parse(m).type === 'user_text' && JSON.parse(m).text === 'hello')).toBe(true)
  })

  it('sends mic audio as a raw binary frame, not a JSON envelope', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    const pcm = new Uint8Array([10, 20, 30]).buffer
    act(() => result.current.sendAudioChunk(pcm))

    const binaryFrames = socket.sent.filter((m): m is ArrayBuffer => m instanceof ArrayBuffer)
    expect(binaryFrames).toEqual([pcm])
  })

  it('sends call_ended and closes on disconnect', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => result.current.disconnect())

    const sentTexts = socket.sent.filter((m): m is string => typeof m === 'string')
    expect(sentTexts.some((m) => JSON.parse(m).type === 'call_ended')).toBe(true)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
  })

  it('moves to an error state when no URL is configured', async () => {
    const { result } = renderHook(() => useTestCallSocket({ url: undefined }))
    act(() => result.current.connect())
    await waitFor(() => expect(result.current.connectionState).toBe('error'))
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
