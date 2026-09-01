/** Real mic capture, matching the backend's `/ws/audio` contract: 16 kHz
 * mono PCM16, sent as raw binary frames. Built on `AudioWorkletNode` rather
 * than the deprecated `ScriptProcessorNode`.
 *
 * The rate is not negotiable — the backend's VAD and ASR are both trained at
 * 16 kHz and the `call_started` handshake rejects anything else. Sending
 * 48 kHz samples labelled as 16 kHz does not error anywhere: it produces
 * audio that plays back at a third speed and transcribes as noise, which
 * costs an afternoon to diagnose. So the rate is asserted, not assumed.
 */

import { env } from './env'

export interface AudioCaptureHandle {
  stop: () => void
}

const SAMPLE_RATE = env.audioSampleRate
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
    // Echo cancellation is not cosmetic here: without it the agent's own
    // voice comes back through the speakers and the backend transcribes
    // itself. There is server-side echo detection, but it is a backstop.
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })

  const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
  // `sampleRate` in the constructor is a request, not a guarantee. Current
  // Chrome, Firefox and Safari honour it; if one does not, failing here is
  // far better than silently streaming unusable audio.
  if (audioContext.sampleRate !== SAMPLE_RATE) {
    for (const track of stream.getTracks()) track.stop()
    await audioContext.close()
    throw new Error(
      `This browser opened the microphone at ${audioContext.sampleRate} Hz; the backend requires ${SAMPLE_RATE} Hz.`,
    )
  }

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

  source.connect(worklet)

  // A worklet only runs while something pulls its output, so it needs a route
  // to the destination — but through a *silent* gain node. Connecting capture
  // to the speakers directly would play the caller back at themselves and
  // feed the agent's voice into the next VAD segment.
  const mute = audioContext.createGain()
  mute.gain.value = 0
  worklet.connect(mute).connect(audioContext.destination)

  return {
    stop: () => {
      worklet.port.onmessage = null
      source.disconnect()
      worklet.disconnect()
      mute.disconnect()
      for (const track of stream.getTracks()) track.stop()
      void audioContext.close()
    },
  }
}
