import { useEffect, useState } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'
import aicaMark from '../assets/aica-mark-light.png'
import { PulseLine } from './PulseLine'

const LETTERS = ['A', 'I', 'C', 'A']
const SHOW_MS = 4150
const FADE_MS = 650
const REDUCED_SHOW_MS = 600
const REDUCED_FADE_MS = 350

/** The one-time boot splash — shown once per browser tab (see App.tsx), never
 * on in-app navigation. Builds the entrance out of the product's own
 * vocabulary (the mark, the pulse) rather than a generic spinner: the mark
 * fills like a gauge, sends out a single pulse when it lands, then the
 * wordmark and the signature Pulse Line settle in underneath. */
export function LoadingScreen({ onDone }: { onDone: () => void }) {
  const reducedMotion = useReducedMotion()
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const showMs = reducedMotion ? REDUCED_SHOW_MS : SHOW_MS
    const fadeMs = reducedMotion ? REDUCED_FADE_MS : FADE_MS
    const leaveTimer = setTimeout(() => setLeaving(true), showMs)
    const doneTimer = setTimeout(onDone, showMs + fadeMs)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(doneTimer)
    }
  }, [reducedMotion, onDone])

  return (
    <div
      role="status"
      aria-label="Loading AICA"
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-b from-ink-teal via-[#16241c] to-ink-teal transition-opacity ease-out ${
        leaving ? 'pointer-events-none opacity-0 duration-500' : 'opacity-100 duration-0'
      }`}
    >
      <div
        className="pointer-events-none absolute inset-0 [background:radial-gradient(circle_at_50%_38%,rgba(118,147,130,0.18),transparent_60%)]"
        aria-hidden="true"
      />

      <div className="relative flex h-48 w-48 shrink-0 items-center justify-center">
        {!reducedMotion && (
          <>
            <span
              className="aica-splash-ring-1 absolute h-28 w-28 rounded-full border border-pulse/50"
              aria-hidden="true"
            />
            <span
              className="aica-splash-ring-2 absolute h-28 w-28 rounded-full border border-pulse/40"
              aria-hidden="true"
            />
            <span
              className="aica-splash-ring-3 absolute h-28 w-28 rounded-full border border-pulse/30"
              aria-hidden="true"
            />
          </>
        )}
        <img
          src={aicaMark}
          alt=""
          aria-hidden="true"
          className={`relative h-24 w-24 ${reducedMotion ? '' : 'aica-splash-mark'}`}
          style={reducedMotion ? undefined : { clipPath: 'inset(100% 0 0 0)' }}
        />
      </div>

      <div className="relative flex flex-col items-center gap-3">
        <div className="flex" aria-hidden="true">
          {LETTERS.map((ch, i) => (
            <span
              key={i}
              className={`font-display text-5xl font-normal tracking-[0.03em] text-mist ${
                reducedMotion ? '' : 'aica-splash-letter opacity-0'
              }`}
              style={reducedMotion ? undefined : { animationDelay: `${1550 + i * 130}ms` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <p
          className={`text-sm text-mist/60 ${reducedMotion ? '' : 'aica-splash-fade opacity-0'}`}
          style={reducedMotion ? undefined : { animationDelay: '2250ms' }}
        >
          Waking up your front desk intelligence
        </p>
      </div>

      <div
        className={`relative w-40 ${reducedMotion ? '' : 'aica-splash-fade opacity-0'}`}
        style={reducedMotion ? undefined : { animationDelay: '2550ms' }}
      >
        <PulseLine mode="idle" height={22} className="text-pulse" aria-label="" />
      </div>
    </div>
  )
}
