import { useEffect, useState } from 'react'
import { useReducedMotion } from '../lib/useReducedMotion'
import aicaMark from '../assets/aica-mark-light.png'

const SHOW_MS = 4150
const FADE_MS = 650
const PAGE_SHOW_MS = 1150
const PAGE_FADE_MS = 350
const REDUCED_SHOW_MS = 600
const REDUCED_FADE_MS = 350

/** Transparent logo-only loading overlay for boot and page transitions. */
export function LoadingScreen({
  onDone,
  pageTransition = false,
}: {
  onDone: () => void
  pageTransition?: boolean
}) {
  const reducedMotion = useReducedMotion()
  const [leaving, setLeaving] = useState(false)

  useEffect(() => {
    const showMs = reducedMotion
      ? REDUCED_SHOW_MS
      : pageTransition
        ? PAGE_SHOW_MS
        : SHOW_MS
    const fadeMs = reducedMotion
      ? REDUCED_FADE_MS
      : pageTransition
        ? PAGE_FADE_MS
        : FADE_MS
    const leaveTimer = setTimeout(() => setLeaving(true), showMs)
    const doneTimer = setTimeout(onDone, showMs + fadeMs)
    return () => {
      clearTimeout(leaveTimer)
      clearTimeout(doneTimer)
    }
  }, [pageTransition, reducedMotion, onDone])

  return (
    <div
      role="status"
      aria-label="Loading AICA"
      className={`fixed inset-0 z-[100] flex items-center justify-center overflow-hidden bg-white/35 backdrop-blur-md transition-opacity ease-out ${
        pageTransition ? 'aica-page-loading' : ''
      } ${
        leaving ? 'pointer-events-none opacity-0 duration-500' : 'opacity-100 duration-0'
      }`}
    >
      <div className="relative flex w-64 max-w-[70vw] flex-col items-center justify-center gap-3">
        <img
          src={aicaMark}
          alt=""
          aria-hidden="true"
          className={`relative h-28 w-28 brightness-0 ${reducedMotion ? '' : 'aica-splash-mark'}`}
          style={reducedMotion ? undefined : { clipPath: 'inset(100% 0 0 0)' }}
        />
        <div className="font-sans text-3xl font-medium tracking-[0.16em] text-ink-teal">AICA</div>
      </div>
    </div>
  )
}
