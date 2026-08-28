import { useEffect, useId, useMemo, useRef } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'
import { makeVoiceLikeSampler, samplesToPath } from '../lib/waveform'

export type PulseLineMode = 'live' | 'spark' | 'idle' | 'end'

export interface PulseLineProps {
  mode: PulseLineMode
  /** `spark` mode only — a raw trend series (e.g. calls/day). Normalized internally. */
  values?: number[]
  /** `live` mode only — returns the next amplitude sample, -1..1. Defaults to a
   * simulated voice signal; swap in a real websocket reader when it's wired up. */
  sample?: () => number
  height?: number
  strokeWidth?: number
  className?: string
  'aria-label'?: string
}

const VIEW_W = 300
const RESOLUTION = 72 // samples across the viewbox width for live/idle

/** The signature element: one animated waveform, reused everywhere. Renders
 * as a real waveform during live calls, compresses into a sparkline on the
 * dashboard, breathes as a soft idle ripple on empty/loading states, and
 * flatlines — a single respectful beat — when a call ends. */
export function PulseLine({
  mode,
  values,
  sample,
  height = 40,
  strokeWidth = 2,
  className = '',
  'aria-label': ariaLabel,
}: PulseLineProps) {
  const reducedMotion = useReducedMotion()
  const maskId = useId()
  const gradientId = useId()

  return (
    <svg
      viewBox={`0 0 ${VIEW_W} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      role="img"
      aria-label={ariaLabel ?? `${mode} pulse`}
      className={className}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="white" stopOpacity="0" />
          <stop offset="8%" stopColor="white" stopOpacity="1" />
          <stop offset="92%" stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        <mask id={maskId}>
          <rect
            x="0"
            y="0"
            width={VIEW_W}
            height={height}
            fill={`url(#${gradientId})`}
          />
        </mask>
      </defs>
      {mode === 'spark' && (
        <SparkPath values={values} height={height} strokeWidth={strokeWidth} />
      )}
      {mode === 'live' && (
        <LivePath
          sample={sample}
          height={height}
          strokeWidth={strokeWidth}
          reducedMotion={reducedMotion}
          maskId={maskId}
        />
      )}
      {mode === 'idle' && (
        <IdlePath
          height={height}
          strokeWidth={strokeWidth}
          reducedMotion={reducedMotion}
          maskId={maskId}
        />
      )}
      {mode === 'end' && (
        <EndPath
          height={height}
          strokeWidth={strokeWidth}
          reducedMotion={reducedMotion}
        />
      )}
    </svg>
  )
}

function normalize(values: number[]): number[] {
  if (values.length === 0) return []
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return values.map(() => 0)
  return values.map((v) => ((v - min) / (max - min)) * 2 - 1)
}

function SparkPath({
  values,
  height,
  strokeWidth,
}: {
  values?: number[]
  height: number
  strokeWidth: number
}) {
  const d = useMemo(() => {
    const series = values && values.length > 0 ? values : [0, 0]
    return samplesToPath(normalize(series), VIEW_W, height)
  }, [values, height])

  return (
    <path
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}

function LivePath({
  sample,
  height,
  strokeWidth,
  reducedMotion,
  maskId,
}: {
  sample?: () => number
  height: number
  strokeWidth: number
  reducedMotion: boolean
  maskId: string
}) {
  const samplerRef = useRef(sample ?? makeVoiceLikeSampler())
  const bufferRef = useRef<number[]>(
    Array.from({ length: RESOLUTION }, () => 0),
  )
  const localRef = useRef<SVGPathElement | null>(null)

  useEffect(() => {
    const node = localRef.current
    if (!node) return

    if (reducedMotion) {
      // Static snapshot: no ongoing animation, still communicates "live".
      const buf = bufferRef.current
      for (let i = 0; i < buf.length; i++) buf[i] = samplerRef.current()
      node.setAttribute('d', samplesToPath(buf, VIEW_W, height))
      return
    }

    let raf = 0
    let last = 0
    const tick = (t: number) => {
      if (t - last > 45) {
        last = t
        const buf = bufferRef.current
        buf.shift()
        buf.push(samplerRef.current())
        node.setAttribute('d', samplesToPath(buf, VIEW_W, height))
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [height, reducedMotion])

  const flatD = useMemo(
    () => samplesToPath(Array.from({ length: RESOLUTION }, () => 0), VIEW_W, height),
    [height],
  )

  return (
    <path
      ref={localRef}
      d={flatD}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      mask={`url(#${maskId})`}
      opacity={0.9}
    />
  )
}

function IdlePath({
  height,
  strokeWidth,
  reducedMotion,
  maskId,
}: {
  height: number
  strokeWidth: number
  reducedMotion: boolean
  maskId: string
}) {
  const localRef = useRef<SVGPathElement | null>(null)

  const staticD = useMemo(() => {
    const samples = Array.from({ length: RESOLUTION }, (_, i) =>
      Math.sin((i / RESOLUTION) * Math.PI * 2) * 0.12,
    )
    return samplesToPath(samples, VIEW_W, height)
  }, [height])

  useEffect(() => {
    if (reducedMotion) return
    const node = localRef.current
    if (!node) return

    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const elapsed = (t - start) / 1000
      const samples = Array.from({ length: RESOLUTION }, (_, i) => {
        const x = i / RESOLUTION
        return Math.sin(x * Math.PI * 2.4 + elapsed * 1.1) * 0.12
      })
      node.setAttribute('d', samplesToPath(samples, VIEW_W, height))
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [height, reducedMotion])

  return (
    <path
      ref={localRef}
      d={staticD}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      mask={`url(#${maskId})`}
      opacity={0.55}
    />
  )
}

function EndPath({
  height,
  strokeWidth,
  reducedMotion,
}: {
  height: number
  strokeWidth: number
  reducedMotion: boolean
}) {
  const pathRef = useRef<SVGPathElement>(null)

  // A settle-then-single-beat-then-flat shape, drawn once left to right.
  const d = useMemo(() => {
    const samples: number[] = []
    for (let i = 0; i < RESOLUTION; i++) {
      const x = i / (RESOLUTION - 1)
      if (x < 0.45) {
        const decay = 1 - x / 0.45
        samples.push(Math.sin(x * 40) * 0.5 * decay)
      } else if (x < 0.58) {
        const local = (x - 0.45) / 0.13
        samples.push(Math.sin(local * Math.PI) * 0.85)
      } else {
        samples.push(0)
      }
    }
    return samplesToPath(samples, VIEW_W, height)
  }, [height])

  useEffect(() => {
    const node = pathRef.current
    if (!node || reducedMotion) return

    const length = node.getTotalLength()
    node.style.strokeDasharray = `${length}`
    node.style.strokeDashoffset = `${length}`

    const duration = 900
    const start = performance.now()
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration)
      const eased = 1 - (1 - p) * (1 - p)
      node.style.strokeDashoffset = `${length * (1 - eased)}`
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reducedMotion])

  return (
    <path
      ref={pathRef}
      d={d}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  )
}
