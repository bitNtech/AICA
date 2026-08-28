import { useState } from 'react'
import { mockImprovementItems } from '../data/mock'
import { DiffCard } from '../components/DiffCard'
import { EmptyState } from '../components/EmptyState'
import { CheckIcon, CloseIcon } from '../components/icons'
import type { ImprovementItem, ImprovementStatus } from '../types'

const STATUS_COPY: Record<ImprovementStatus, string> = {
  pending: '',
  queued: 'Queued in Simulation',
  approved: 'Approved — live in the current config',
  dismissed: 'Dismissed',
}

const LOOP_STAGES = ['Drafted', 'Simulation', 'Rollout'] as const

function loopIndex(status: ImprovementStatus): number {
  if (status === 'approved') return 3
  if (status === 'queued') return 2
  return 1
}

export function ImprovementFeedPage() {
  const [items, setItems] = useState(mockImprovementItems)

  function setStatus(id: string, status: ImprovementStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  const visible = items.filter((i) => i.status !== 'dismissed')

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Drawn from calls AICA couldn't answer confidently this week. Approve
        a fix and it's queued into Simulation before going live — nothing
        ships without a check.
      </p>

      {visible.length === 0 ? (
        <EmptyState
          title="Nothing new this week"
          description="AICA hasn't found a recurring gap worth drafting a fix for. Check back after more calls come in."
        />
      ) : (
        visible.map((item) => (
          <ImprovementCard key={item.id} item={item} onSetStatus={setStatus} />
        ))
      )}
    </div>
  )
}

function ImprovementCard({
  item,
  onSetStatus,
}: {
  item: ImprovementItem
  onSetStatus: (id: string, status: ImprovementStatus) => void
}) {
  const stage = loopIndex(item.status)

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-body">{item.title}</p>
          <p className="mt-1 text-sm text-muted">{item.detail}</p>
        </div>
        <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 font-mono text-xs text-muted">
          {item.callsAffected} calls
        </span>
      </div>

      <div className="mt-4">
        <DiffCard before={item.before} after={item.after} />
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-4">
        {item.status === 'pending' ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onSetStatus(item.id, 'queued')}
              className="btn-primary !px-4 !py-1.5"
            >
              <CheckIcon className="h-3.5 w-3.5" />
              Approve
            </button>
            <button
              type="button"
              onClick={() => onSetStatus(item.id, 'dismissed')}
              className="btn-ghost"
            >
              <CloseIcon className="h-3.5 w-3.5" />
              Dismiss
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm font-medium text-sage">
            <span className="h-1.5 w-1.5 rounded-full bg-sage" />
            {STATUS_COPY[item.status]}
          </p>
        )}

        {item.status !== 'pending' && (
          <div className="flex items-center gap-1.5" aria-label="Improvement pipeline progress">
            {LOOP_STAGES.map((label, i) => (
              <div key={label} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${
                    i + 1 <= stage ? 'bg-sage/12 text-sage' : 'bg-canvas text-faint'
                  }`}
                >
                  {label}
                </span>
                {i < LOOP_STAGES.length - 1 && (
                  <span className={`h-px w-3 ${i + 1 < stage ? 'bg-sage/50' : 'bg-hairline'}`} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
