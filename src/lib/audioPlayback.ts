/** Plays PCM16 chunks back as they arrive rather than buffering the whole
 * reply first — each chunk is scheduled right after the previous one so
 * playback stays gapless without waiting for the full clip. */
export class ChunkedAudioPlayer {
  private ctx: AudioContext | null = null
  private nextStartAt = 0
  private sampleRate: number

  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate
  }

  play(pcm: ArrayBuffer) {
    const ctx = this.ensureContext()
    const int16 = new Int16Array(pcm)
    const float32 = new Float32Array(int16.length)
    for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000

    const buffer = ctx.createBuffer(1, float32.length, this.sampleRate)
    buffer.copyToChannel(float32, 0)

    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.connect(ctx.destination)

    const startAt = Math.max(ctx.currentTime, this.nextStartAt)
    source.start(startAt)
    this.nextStartAt = startAt + buffer.duration
  }

  stop() {
    this.ctx?.close()
    this.ctx = null
    this.nextStartAt = 0
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: this.sampleRate })
      this.nextStartAt = 0
    }
    return this.ctx
  }
}
