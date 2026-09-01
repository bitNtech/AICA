/** Plays the agent's voice as it arrives — one binary frame per clause,
 * each scheduled right after the previous one so clauses play back to back
 * instead of overlapping or waiting for the whole reply.
 *
 * Two things here are not obvious:
 *
 * 1. The downlink rate is *not* the mic rate. The backend announces it in
 *    `agent_speaking_start` (24 kHz with the default Edge TTS engine, but it
 *    is engine-dependent) so it is read from the wire, never hardcoded. The
 *    AudioContext itself stays at the device's own rate — an AudioBuffer
 *    declared at 24 kHz is resampled by the browser on playback, so there is
 *    no need to tear down and rebuild a context per turn.
 *
 * 2. `stop()` must call `.stop()` on every scheduled source. Resetting the
 *    playback clock alone does nothing: a buffer whose start time is still in
 *    the future has already been handed to the audio device, and it will play
 *    regardless — which sounds like the agent talking over the caller who
 *    just interrupted it. That is the whole of barge-in.
 */

export class ChunkedAudioPlayer {
  private ctx: AudioContext | null = null
  private nextStartAt = 0
  /** Scheduled-but-not-finished sources, so barge-in can kill them. */
  private live: AudioBufferSourceNode[] = []
  private sampleRate: number

  /** 24 kHz is the default TTS engine's rate — a fallback only, for audio
   * that somehow arrives before `agent_speaking_start` announced the rate. */
  constructor(sampleRate = 24000) {
    this.sampleRate = sampleRate
  }

  /** Called on `agent_speaking_start`. Applies from the next clause on;
   * anything already scheduled keeps the rate it was decoded at. */
  setSampleRate(rate: number) {
    if (rate > 0) this.sampleRate = rate
  }

  play(pcm: ArrayBuffer) {
    const int16 = new Int16Array(pcm)
    if (int16.length === 0) return

    const ctx = this.ensureContext()
    // A context created before a user gesture starts suspended; a test call
    // always begins with a click, so resuming here is enough.
    if (ctx.state === 'suspended') void ctx.resume()

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

    this.live.push(source)
    source.onended = () => {
      this.live = this.live.filter((s) => s !== source)
    }
  }

  /** Barge-in: silence everything queued, immediately. Keeps the context
   * alive so the next clause does not pay for a fresh one. */
  stop() {
    for (const source of this.live) {
      try {
        source.stop()
      } catch {
        // Already finished, or never started — nothing to silence.
      }
    }
    this.live = []
    this.nextStartAt = this.ctx?.currentTime ?? 0
  }

  /** End of call. After this the player is reusable — `play` rebuilds. */
  close() {
    this.stop()
    void this.ctx?.close()
    this.ctx = null
    this.nextStartAt = 0
  }

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext()
      this.nextStartAt = 0
    }
    return this.ctx
  }
}
