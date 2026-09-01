import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendCapabilities, ServerEvent } from './testCallProtocol'
import { normalizeServerEvent, WS_CLOSE_UNAUTHORIZED } from './testCallProtocol'
import { ChunkedAudioPlayer } from './audioPlayback'
import { env } from './env'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

interface UseTestCallSocketOptions {
  url: string | undefined
  /** Optional shared-secret token, sent as `?token=` on the handshake — see
   * `backend/settings.py`'s `SecuritySettings.ws_auth_token`.
   * A WS client can't set a custom header, so the token travels as a query
   * param. Leave unset when the backend has no `AUDIO_WS_AUTH_TOKEN`. */
  token?: string
  language?: string
  onEvent?: (event: ServerEvent) => void
}

interface UseTestCallSocketResult {
  connectionState: ConnectionState
  capabilities: BackendCapabilities | null
  /** The backend's id for this call, from `ready`. Matches the call log. */
  connectionId: string | null
  errorMessage: string | null
  /** Opens a call. The language is fixed for the connection — the backend has
   * no mid-call switch — so it is passed here, not held as an option. */
  connect: (language?: string) => void
  disconnect: () => void
  sendText: (text: string) => void
  sendAudioChunk: (pcm: ArrayBuffer) => void
}

/** Opens (and tears down) a WebSocket session against the backend's real
 * `/ws/audio` contract: `call_started` on open, a typed stream of JSON
 * server events back plus raw binary frames for TTS audio, `call_ended` on
 * close. Connection lifecycle, declared capabilities and audio playback all
 * live here so `DirectTestingPanel` only has to render state.
 *
 * Playback belongs in here rather than in the panel because barge-in has to
 * be unconditional: `vad_start` must silence the agent within the same tick
 * it arrives, before any React render can intervene. Every consumer of this
 * hook gets that for free and none of them can forget it. */
export function useTestCallSocket({
  url,
  token,
  language = env.callLanguage,
  onEvent,
}: UseTestCallSocketOptions): UseTestCallSocketResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null)
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const playerRef = useRef<ChunkedAudioPlayer | null>(null)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const disconnect = useCallback(() => {
    playerRef.current?.close()
    playerRef.current = null
    const socket = socketRef.current
    if (!socket) return
    socketRef.current = null
    if (socket.readyState === WebSocket.OPEN) {
      // Flushes any half-captured utterance through the backend's VAD before
      // the socket goes away, so a turn in flight is not silently dropped.
      socket.send(JSON.stringify({ type: 'call_ended' }))
    }
    socket.close()
  }, [])

  const connect = useCallback(
    (languageOverride?: string) => {
      if (!url) {
        setConnectionState('error')
        setErrorMessage('VITE_BACKEND_WS_URL is not set — nothing to connect to.')
        return
      }
      // One call per socket, and a second `call_started` on the same one is a
      // protocol error. A re-entrant connect (StrictMode's double effect, an
      // impatient double click) must be a no-op, not a second greeting.
      if (socketRef.current) return

      setConnectionState('connecting')
      setErrorMessage(null)
      setCapabilities(null)
      setConnectionId(null)

      const target = token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url

      let socket: WebSocket
      try {
        socket = new WebSocket(target)
      } catch {
        setConnectionState('error')
        setErrorMessage('Could not open a connection to the backend.')
        return
      }
      // Binary frames (TTS audio) arrive as raw PCM16 bytes, not base64/JSON —
      // ArrayBuffer is the cheapest form to hand straight to the audio player.
      socket.binaryType = 'arraybuffer'
      socketRef.current = socket
      const player = new ChunkedAudioPlayer()
      playerRef.current = player

      socket.onopen = () => {
        setConnectionState('connected')
        socket.send(
          JSON.stringify({
            type: 'call_started',
            audio_format: 'pcm_s16le',
            sample_rate: env.audioSampleRate,
            channels: 1,
            language: languageOverride ?? language,
          }),
        )
      }

      socket.onmessage = (evt) => {
        if (evt.data instanceof ArrayBuffer) {
          player.play(evt.data)
          onEventRef.current?.({ type: 'agent_audio_chunk', audio: evt.data })
          return
        }

        let parsed: ServerEvent | null = null
        try {
          parsed = normalizeServerEvent(JSON.parse(evt.data as string))
        } catch {
          return
        }
        if (!parsed) return

        switch (parsed.type) {
          case 'ready':
            setCapabilities(parsed.capabilities)
            setConnectionId(parsed.connectionId || null)
            break
          case 'agent_speaking_start':
            if (parsed.sampleRate) player.setSampleRate(parsed.sampleRate)
            break
          // Barge-in. `vad_start` fires on 240 ms of caller speech (640 ms
          // while the agent is still audible), so it can arrive without an
          // `agent_interrupted` ever following. Stop anyway: a false stop is
          // recoverable, talking over the caller is not.
          case 'vad_start':
          case 'agent_interrupted':
            player.stop()
            break
          case 'asr_error':
          case 'pipeline_error':
          case 'protocol_error':
            setErrorMessage(parsed.message)
            break
        }
        onEventRef.current?.(parsed)
      }

      socket.onerror = () => {
        setConnectionState('error')
        setErrorMessage((prev) => prev ?? 'Could not reach the backend.')
      }

      socket.onclose = (evt) => {
        const code = (evt as CloseEvent | undefined)?.code ?? 0
        player.close()
        if (playerRef.current === player) playerRef.current = null
        socketRef.current = null
        // 4401 is refused *before* `accept()`, so the call never got a `ready`
        // event. It needs different copy from an ordinary disconnect.
        if (code === WS_CLOSE_UNAUTHORIZED) {
          setConnectionState('error')
          setErrorMessage('Rejected by the backend: bad or missing token.')
        } else {
          setConnectionState((prev) => (prev === 'error' ? prev : 'closed'))
        }
        onEventRef.current?.({
          type: 'closed',
          code,
          message: code === WS_CLOSE_UNAUTHORIZED ? 'Rejected by the backend: bad or missing token.' : '',
        })
      }
    },
    [url, token, language],
  )

  useEffect(() => disconnect, [disconnect])

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'user_text', text }))
  }, [])

  /** Sends raw PCM16 straight over the wire as a binary frame — the backend
   * reads `message["bytes"]` directly off the socket, with no JSON envelope
   * and no base64 encoding step. */
  const sendAudioChunk = useCallback((pcm: ArrayBuffer) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(pcm)
  }, [])

  return {
    connectionState,
    capabilities,
    connectionId,
    errorMessage,
    connect,
    disconnect,
    sendText,
    sendAudioChunk,
  }
}
