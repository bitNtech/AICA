import { useCallback, useEffect, useRef, useState } from 'react'
import type { BackendCapabilities, ServerEvent } from './testCallProtocol'
import { arrayBufferToBase64, normalizeServerEvent } from './testCallProtocol'

export type ConnectionState = 'idle' | 'connecting' | 'connected' | 'closed' | 'error'

interface UseTestCallSocketOptions {
  url: string | undefined
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

/** Opens (and tears down) a WebSocket session against the backend's
 * `/ws/audio` contract: `call_started` on open, a typed stream of server
 * events back, `call_ended` on close. Connection lifecycle and declared
 * capabilities live here so `DirectTestingPanel` only has to render state,
 * not manage the socket. */
export function useTestCallSocket({
  url,
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

    let socket: WebSocket
    try {
      socket = new WebSocket(url)
    } catch {
      setConnectionState('error')
      setErrorMessage('Could not open a connection to the backend.')
      return
    }
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
      let parsed: ServerEvent | null = null
      try {
        parsed = normalizeServerEvent(JSON.parse(evt.data))
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
  }, [url, language])

  useEffect(() => disconnect, [disconnect])

  const sendText = useCallback((text: string) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'user_text', text }))
  }, [])

  const sendAudioChunk = useCallback((pcm: ArrayBuffer) => {
    const socket = socketRef.current
    if (!socket || socket.readyState !== WebSocket.OPEN) return
    socket.send(JSON.stringify({ type: 'user_audio_chunk', audio: arrayBufferToBase64(pcm) }))
  }, [])

  return { connectionState, capabilities, errorMessage, connect, disconnect, sendText, sendAudioChunk }
}
