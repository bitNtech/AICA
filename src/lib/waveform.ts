/** Shared helpers for turning a series of samples into a smooth SVG path. */

/** Samples are -1..1, centered on 0. Produces a smoothed path via
 * quadratic midpoint smoothing so the line reads as an organic waveform
 * rather than a jagged polyline. */
export function samplesToPath(
  samples: number[],
  width: number,
  height: number,
): string {
  if (samples.length === 0) return ''
  const midY = height / 2
  const amp = height / 2 - 1

  const points = samples.map((s, i) => {
    const x = samples.length === 1 ? 0 : (i / (samples.length - 1)) * width
    const y = midY - clamp(s, -1, 1) * amp
    return [x, y] as const
  })

  if (points.length < 3) {
    const [x0, y0] = points[0]
    return `M ${x0} ${y0} L ${points[points.length - 1][0]} ${points[points.length - 1][1]}`
  }

  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [x0, y0] = points[i]
    const [x1, y1] = points[i + 1]
    const mx = (x0 + x1) / 2
    const my = (y0 + y1) / 2
    d += ` Q ${x0} ${y0} ${mx} ${my}`
  }
  const last = points[points.length - 1]
  d += ` L ${last[0]} ${last[1]}`
  return d
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** A gentle pseudo-random walk that stays in -1..1 — stands in for a real
 * amplitude stream until the backend websocket is wired up. */
export function makeVoiceLikeSampler(): () => number {
  let value = 0
  let velocity = 0
  return () => {
    velocity += (Math.random() - 0.5) * 0.35
    velocity *= 0.7
    value += velocity
    value = clamp(value, -1, 1)
    if (Math.random() < 0.06) value *= 0.3
    return value
  }
}
