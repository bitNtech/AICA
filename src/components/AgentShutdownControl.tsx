import { useState } from 'react'
import { useAgentStore } from '../store/agent'
import { useUiStore } from '../store/ui'
import { formatRelativeTime } from '../lib/format'
import { PowerIcon } from './icons'

/** The break-glass control — switches every inbound call to the clinic's own
 * manual front-desk workforce without touching any agent config. Pausing
 * asks for a reason first since it's high-impact; resuming is a single
 * click since it only restores normal operation. */
export function AgentShutdownControl() {
  const status = useAgentStore((s) => s.status)
  const pausedReason = useAgentStore((s) => s.pausedReason)
  const pausedAt = useAgentStore((s) => s.pausedAt)
  const pause = useAgentStore((s) => s.pause)
  const resume = useAgentStore((s) => s.resume)
  const openDrawer = useUiStore((s) => s.openDrawer)
  const closeDrawer = useUiStore((s) => s.closeDrawer)

  const isPaused = status === 'paused'

  function openPauseConfirm() {
    openDrawer({
      title: 'Pause AICA',
      subtitle: 'Switch to your manual front-desk workforce',
      body: (
        <PauseAgentForm
          onConfirm={(reason) => {
            pause(reason)
            closeDrawer()
          }}
        />
      ),
    })
  }

  return (
    <div className={`card p-5 ${isPaused ? 'border-amber/30 bg-amber/5' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
              isPaused ? 'bg-amber/15 text-amber' : 'bg-canvas text-muted'
            }`}
          >
            <PowerIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-body">
              {isPaused ? 'AICA is paused' : 'Temporary shutdown'}
            </p>
            <p className="mt-0.5 text-sm text-muted">
              {isPaused
                ? `Manual workforce is handling calls${pausedReason ? ` — ${pausedReason}` : ''}${
                    pausedAt ? ` · since ${formatRelativeTime(pausedAt)}` : ''
                  }`
                : "Switch every inbound call to your team's manual workflow without changing any agent config."}
            </p>
          </div>
        </div>
        {isPaused ? (
          <button type="button" onClick={resume} className="btn-primary shrink-0 !px-4 !py-1.5">
            Resume AICA
          </button>
        ) : (
          <button
            type="button"
            onClick={openPauseConfirm}
            className="btn-danger shrink-0 !px-4 !py-1.5"
          >
            Pause AICA
          </button>
        )}
      </div>
    </div>
  )
}

function PauseAgentForm({ onConfirm }: { onConfirm: (reason: string) => void }) {
  const [reason, setReason] = useState('')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        AICA stops answering new calls immediately — every inbound call routes to your front desk
        instead, until you resume.
      </p>
      <div>
        <label className="text-xs font-semibold uppercase tracking-wide text-muted" htmlFor="pause-reason">
          Reason (optional)
        </label>
        <textarea
          id="pause-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="e.g. Front desk is fully staffed today"
          className="mt-1.5 w-full resize-none rounded-lg border border-hairline bg-surface px-3 py-2 text-sm text-body placeholder:text-faint transition-colors focus:border-pulse/50 focus:outline-none"
        />
      </div>
      <button type="button" onClick={() => onConfirm(reason.trim())} className="btn-danger self-start">
        Pause AICA now
      </button>
    </div>
  )
}
