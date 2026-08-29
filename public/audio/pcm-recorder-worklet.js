// AudioWorklet processor: accumulates the mic's Float32 samples (the
// AudioContext is opened at 16kHz — see lib/audioCapture.ts — so no manual
// resampling is needed here) and posts fixed-size Int16 PCM chunks back to
// the main thread. Runs on the audio rendering thread, so it must stay
// dependency-free and allocation-light in the steady state.
class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._buffer = []
    // 200ms at 16kHz — small enough to feel live, large enough not to spam
    // the socket with a message per render quantum (128 samples).
    this._chunkSamples = 3200
  }

  process(inputs) {
    const channelData = inputs[0]?.[0]
    if (channelData) {
      for (let i = 0; i < channelData.length; i++) {
        this._buffer.push(channelData[i])
      }
      while (this._buffer.length >= this._chunkSamples) {
        this._flush(this._buffer.splice(0, this._chunkSamples))
      }
    }
    return true
  }

  _flush(samples) {
    const pcm16 = new Int16Array(samples.length)
    for (let i = 0; i < samples.length; i++) {
      const s = Math.max(-1, Math.min(1, samples[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
    }
    this.port.postMessage(pcm16.buffer, [pcm16.buffer])
  }
}

registerProcessor('pcm-recorder-processor', PCMRecorderProcessor)
