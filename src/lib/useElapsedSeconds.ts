import { useEffect, useState } from 'react'

/** Ticks once a second based on a real start timestamp, so call durations
 * genuinely climb instead of sitting frozen at a fixture value. */
export function useElapsedSeconds(startedAtIso: string): number {
  const compute = () => Math.max(0, Math.floor((Date.now() - new Date(startedAtIso).getTime()) / 1000))
  const [elapsed, setElapsed] = useState(compute)

  useEffect(() => {
    setElapsed(compute())
    const id = setInterval(() => setElapsed(compute()), 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startedAtIso])

  return elapsed
}
