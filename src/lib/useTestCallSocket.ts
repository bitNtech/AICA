import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendCapabilities, ServerEvent } from './testCallProtocol'
import { normalizeServerEvent } from './testCallProtocol'

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
  errorMessage: string | null
  connect: () => void
  disconnect: () => void
  sendText: (text: string) => void
  sendAudioChunk: (pcm: ArrayBuffer) => void
}

/** Opens (and tears down) a WebSocket session against the backend's real
 * `/ws/audio` contract: `call_started` on open, a typed stream of JSON
 * server events back plus raw binary frames for TTS audio, `call_ended` on
 * close. Connection lifecycle and declared capabilities live here so
 * `DirectTestingPanel` only has to render state, not manage the socket. */
export function useTestCallSocket({
  url,
  token,
  language = 'ta',
  onEvent,
}: UseTestCallSocketOptions): UseTestCallSocketResult {
  const [connectionState, setConnectionState] = useState<ConnectionState>('idle')
  const [capabilities, setCapabilities] = useState<BackendCapabilities | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const onEventRef = useRef(onEvent)
  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  const disconnect = useCallback(() => {
    const socket = socketRef.current
    if (!socket) return
    socketRef.current = null
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: 'call_ended' }))
    }
    socket.close()
  }, [])

  const connect = useCallback(() => {
    if (!url) {
      setConnectionState('error')
      setErrorMessage('VITE_BACKEND_WS_URL is not set — nothing to connect to.')
      return
    }
    if (socketRef.current) return

    setConnectionState('connecting')
    setErrorMessage(null)
    setCapabilities(null)

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

    socket.onopen = () => {
      setConnectionState('connected')
      socket.send(
        JSON.stringify({
          type: 'call_started',
          audio_format: 'pcm_s16le',
          sample_rate: 16000,
          channels: 1,
          language,
        }),
      )
    }

    socket.onmessage = (evt) => {
      if (evt.data instanceof ArrayBuffer) {
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
      if (parsed.type === 'ready') setCapabilities(parsed.capabilities)
      if (parsed.type === 'asr_error' || parsed.type === 'pipeline_error' || parsed.type === 'protocol_error') {
        setErrorMessage(parsed.message)
      }
      onEventRef.current?.(parsed)
    }

    socket.onerror = () => {
      setConnectionState('error')
      setErrorMessage((prev) => prev ?? 'Connection error.')
    }

    socket.onclose = () => {
      socketRef.current = null
      setConnectionState((prev) => (prev === 'error' ? prev : 'closed'))
    }
  }, [url, token, language])

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

  return { connectionState, capabilities, errorMessage, connect, disconnect, sendText, sendAudioChunk }
}
