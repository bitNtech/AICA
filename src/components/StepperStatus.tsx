import { CheckIcon } from './icons'

export interface Step {
  id: string
  label: string
}

/** A horizontal pipeline stepper — makes an otherwise invisible backend
 * process (ingest, rollout) feel accountable. `currentIndex` steps before
 * it are done, that one is active, the rest are pending. */
export function StepperStatus({
  steps,
  currentIndex,
}: {
  steps: Step[]
  currentIndex: number
}) {
  return (
    <ol className="flex items-center">
      {steps.map((step, i) => {
        const done = i < currentIndex
        const active = i === currentIndex
        return (
          <li key={step.id} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold ${
                  done
                    ? 'bg-sage text-ink-teal'
                    : active
                      ? 'bg-pulse text-ink-teal'
                      : 'bg-canvas text-muted'
                }`}
              >
                {done ? <CheckIcon className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span
                className={`whitespace-nowrap text-xs font-medium ${done || active ? 'text-body' : 'text-muted'}`}
              >
                {step.label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div
                className={`mx-2 h-px flex-1 ${done ? 'bg-sage' : 'bg-hairline'}`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
