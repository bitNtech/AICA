import { useEffect, useState } from 'react'
import type { ConfidenceLevel } from '../types'

type AiState = 'listening' | 'speaking' | 'thinking' | 'transferring' | 'review'

const CYCLE: AiState[] = ['listening', 'speaking', 'thinking']

const CONFIG: Record<AiState, { label: string; dot: string; text: string; pulseDot?: boolean }> = {
  listening: { label: 'Listening', dot: 'bg-signal', text: 'text-signal', pulseDot: true },
  speaking: { label: 'Speaking', dot: 'bg-pulse', text: 'text-pulse', pulseDot: true },
  thinking: { label: 'Thinking', dot: 'bg-insight', text: 'text-insight', pulseDot: true },
  transferring: { label: 'Transferring', dot: 'bg-amber', text: 'text-amber' },
  review: { label: 'Needs review', dot: 'bg-critical', text: 'text-critical' },
}

/** A small state chip communicating what AICA is doing on a live call right
 * now. Calls already flagged low-confidence or under-review show that real
 * signal instead of cycling; everywhere else it cycles gently through the
 * natural conversational rhythm as a liveness cue — no backend state is
 * implied or fabricated, this is presentation only, same spirit as the
 * simulated waveform amplitude in PulseLine. */
export function AiStateIndicator({
  confidence,
  className = '',
}: {
  confidence: ConfidenceLevel
  className?: string
}) {
  const [i, setI] = useState(0)
  const forced: AiState | null =
    confidence === 'low' ? 'transferring' : confidence === 'review' ? 'review' : null

  useEffect(() => {
    if (forced) return
    const id = setInterval(() => setI((v) => (v + 1) % CYCLE.length), 2600)
    return () => clearInterval(id)
  }, [forced])

  const state = forced ?? CYCLE[i]
  const c = CONFIG[state]

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${c.text} ${className}`}>
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${c.dot} ${c.pulseDot ? 'animate-pulse' : ''}`}
        aria-hidden="true"
      />
      {c.label}
    </span>
  )
}
