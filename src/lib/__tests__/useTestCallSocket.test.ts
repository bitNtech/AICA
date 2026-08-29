import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useTestCallSocket } from '../useTestCallSocket'
import type { ServerEvent } from '../testCallProtocol'

/** A fake WebSocket standing in for a real backend session — mirrors the
 * backend repo's own pattern of testing orchestration logic against a fake
 * client rather than a real socket/model. */
class FakeWebSocket {
  static instances: FakeWebSocket[] = []
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3

  readyState = FakeWebSocket.CONNECTING
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onerror: (() => void) | null = null
  onclose: (() => void) | null = null

  url: string

  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }

  send(data: string) {
    this.sent.push(data)
  }

  close() {
    this.readyState = FakeWebSocket.CLOSED
    this.onclose?.()
  }

  simulateOpen() {
    this.readyState = FakeWebSocket.OPEN
    this.onopen?.()
  }

  simulateMessage(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) })
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
    expect(JSON.parse(socket.sent[0])).toEqual({
      type: 'call_started',
      audio_format: 'pcm_s16le',
      sample_rate: 16000,
      channels: 1,
      language: 'ta',
    })
  })

  it('captures declared capabilities from the ready event', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => socket.simulateMessage({ type: 'ready', capabilities: { asr: true, llm: false, tts: false } }))

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

    act(() => socket.simulateMessage({ type: 'agent_text', text: 'Thanks for calling.' }))

    expect(events).toEqual([{ type: 'agent_text', text: 'Thanks for calling.' }])
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

    expect(socket.sent.some((m) => JSON.parse(m).type === 'user_text' && JSON.parse(m).text === 'hello')).toBe(
      true,
    )
  })

  it('sends call_ended and closes on disconnect', () => {
    const { result } = renderHook(() => useTestCallSocket({ url: 'ws://test' }))
    act(() => result.current.connect())
    const socket = FakeWebSocket.instances[0]
    act(() => socket.simulateOpen())

    act(() => result.current.disconnect())

    expect(socket.sent.some((m) => JSON.parse(m).type === 'call_ended')).toBe(true)
    expect(socket.readyState).toBe(FakeWebSocket.CLOSED)
  })

  it('moves to an error state when no URL is configured', async () => {
    const { result } = renderHook(() => useTestCallSocket({ url: undefined }))
    act(() => result.current.connect())
    await waitFor(() => expect(result.current.connectionState).toBe('error'))
    expect(FakeWebSocket.instances).toHaveLength(0)
  })
})
