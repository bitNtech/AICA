/** Real mic capture, matching the backend's `/ws/audio` contract (16kHz
 * mono PCM16). Built on `AudioWorkletNode` rather than the deprecated
 * `ScriptProcessorNode` — see FRONTEND_IMPROVEMENTS.md §1.1. The backend
 * repo's own `audio-stream.js` documents the same framing/format and is a
 * useful spec to cross-check against, but that file is vanilla JS written
 * for a different codebase, not something to port directly. */

export interface AudioCaptureHandle {
  stop: () => void
}

const SAMPLE_RATE = 16000
const WORKLET_URL = '/audio/pcm-recorder-worklet.js'

export function isMicCaptureSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia) &&
    typeof AudioContext !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined'
  )
}

/** Starts streaming the mic to `onChunk` as raw PCM16 `ArrayBuffer`s.
 * `onAmplitude` (if given) receives a 0..1 peak level per chunk — enough to
 * drive `PulseLine`'s live waveform from the real signal instead of the
 * decorative random walk. Call the returned `stop()` to release the mic. */
export async function startMicCapture(
  onChunk: (pcm: ArrayBuffer) => void,
  onAmplitude?: (level: number) => void,
): Promise<AudioCaptureHandle> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  })

  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  await audioContext.audioWorklet.addModule(WORKLET_URL)

  const source = audioContext.createMediaStreamSource(stream)
  const worklet = new AudioWorkletNode(audioContext, 'pcm-recorder-processor')

  worklet.port.onmessage = (event: MessageEvent<ArrayBuffer>) => {
    const buffer = event.data
    onChunk(buffer)
    if (onAmplitude) {
      const view = new Int16Array(buffer)
      let peak = 0
      for (let i = 0; i < view.length; i++) peak = Math.max(peak, Math.abs(view[i]))
      onAmplitude(peak / 0x8000)
    }
  }

  // Deliberately not connected to `audioContext.destination` — this is a
  // capture path, not local monitoring/playback of the caller's own mic.
  source.connect(worklet)

  return {
    stop: () => {
      worklet.port.onmessage = null
      source.disconnect()
      worklet.disconnect()
      for (const track of stream.getTracks()) track.stop()
      void audioContext.close()
    },
  }
}
