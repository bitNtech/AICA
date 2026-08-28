import { useState } from 'react'
import { mockImprovementItems, mockLowConfidenceActions } from '../data/mock'
import { DiffCard } from '../components/DiffCard'
import { EmptyState } from '../components/EmptyState'
import { ConfidenceBadge } from '../components/ConfidenceBadge'
import { CheckIcon, CloseIcon } from '../components/icons'
import { formatRelativeTime } from '../lib/format'
import type { ImprovementItem, ImprovementStatus, LowConfidenceAction } from '../types'

const STATUS_COPY: Record<ImprovementStatus, string> = {
  pending: '',
  queued: 'Queued in Simulation',
  approved: 'Approved — live in the current config',
  dismissed: 'Dismissed',
}

const LOOP_STAGES = ['Drafted', 'Simulation', 'Live'] as const

function loopIndex(status: ImprovementStatus): number {
  if (status === 'approved') return 3
  if (status === 'queued') return 2
  return 1
}

/** The next Monday from now, in local time — the weekly cadence low-confidence
 * feedback is batched into. */
function nextTrainingRun(): Date {
  const d = new Date()
  const untilMonday = (8 - d.getDay()) % 7 || 7
  d.setDate(d.getDate() + untilMonday)
  return d
}

export function ImprovementFeedPage() {
  const [items, setItems] = useState(mockImprovementItems)
  const [actions, setActions] = useState(mockLowConfidenceActions)

  function setStatus(id: string, status: ImprovementStatus) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)))
  }

  function setAfterText(id: string, after: string) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, after } : i)))
  }

  function resolveAction(id: string, optionId: string, customText?: string) {
    setActions((prev) =>
      prev.map((a) => (a.id === id ? { ...a, resolution: { optionId, customText } } : a)),
    )
  }

  const visible = items.filter((i) => i.status !== 'dismissed')
  const reviewedCount = actions.filter((a) => a.resolution).length
  const trainingDate = nextTrainingRun().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  })

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-body">Low-confidence actions</h2>
            <p className="mt-1 text-sm text-muted">
              Every call AICA answered under threshold this week. Pick the response it should
              have given instead — reviewed picks are batched into the next weekly training run.
            </p>
          </div>
          <span className="shrink-0 rounded-full bg-canvas px-2.5 py-1 text-xs font-medium text-muted">
            {reviewedCount}/{actions.length} reviewed · Next run {trainingDate}
          </span>
        </div>

        {actions.length === 0 ? (
          <EmptyState
            title="No low-confidence actions"
            description="Every call this week cleared the confidence threshold on its own."
          />
        ) : (
          actions.map((action) => (
            <LowConfidenceActionCard key={action.id} action={action} onResolve={resolveAction} />
          ))
        )}
      </section>

      <section className="flex flex-col gap-4">
        <div>
          <h2 className="text-sm font-semibold text-body">Recurring gaps</h2>
          <p className="mt-1 text-sm text-muted">
            Drawn from calls AICA couldn't answer confidently this week. Edit the draft if the
            wording isn't right, then approve it — it's queued into Simulation before going live,
            nothing ships without a check.
          </p>
        </div>

        {visible.length === 0 ? (
          <EmptyState
            title="Nothing new this week"
            description="AICA hasn't found a recurring gap worth drafting a fix for. Check back after more calls come in."
          />
        ) : (
          visible.map((item) => (
            <ImprovementCard
              key={item.id}
              item={item}
              onSetStatus={setStatus}
              onAfterChange={setAfterText}
            />
          ))
        )}
      </section>
    </div>
  )
}

function LowConfidenceActionCard({
  action,
  onResolve,
}: {
  action: LowConfidenceAction
  onResolve: (id: string, optionId: string, customText?: string) => void
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [useCustom, setUseCustom] = useState(false)
  const [customText, setCustomText] = useState('')

  const resolved = action.resolution
  const resolvedResponse = resolved
    ? resolved.optionId === 'custom'
      ? resolved.customText
      : action.options.find((o) => o.id === resolved.optionId)?.response
    : null

  const canSave = useCustom ? customText.trim().length > 0 : selectedId !== null

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-body">{action.intent}</p>
          <p className="mt-0.5 text-xs text-muted">
            {action.callerLabel} · {formatRelativeTime(action.timestamp)}
          </p>
        </div>
        <ConfidenceBadge level="low" score={action.confidenceScore} />
      </div>

      <div className="mt-3 rounded-2xl border border-hairline bg-canvas p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted">What AICA did</p>
        <p className="mt-2 text-sm leading-relaxed text-body">{action.aiAction}</p>
      </div>

      {resolved ? (
        <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sage/30 bg-sage/10 p-4">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-sage/15 text-sage">
            <CheckIcon className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="text-sm font-medium text-sage">
              Optimal response recorded — queued for the next training run
            </p>
            <p className="mt-1 text-sm text-body">{resolvedResponse}</p>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted">
            Choose the optimal response
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {action.options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  setSelectedId(opt.id)
                  setUseCustom(false)
                }}
                aria-pressed={selectedId === opt.id && !useCustom}
                className={`rounded-xl border p-3.5 text-left transition-colors duration-150 ${
                  selectedId === opt.id && !useCustom
                    ? 'border-pulse bg-pulse/10'
                    : 'border-hairline bg-surface hover:bg-surface-hover'
                }`}
              >
                <p className="text-sm font-medium text-body">{opt.label}</p>
                <p className="mt-0.5 text-xs text-muted">{opt.response}</p>
              </button>
            ))}
            <button
              type="button"
              onClick={() => setUseCustom(true)}
              aria-pressed={useCustom}
              className={`rounded-xl border p-3.5 text-left transition-colors duration-150 ${
                useCustom
                  ? 'border-pulse bg-pulse/10'
                  : 'border-hairline bg-surface hover:bg-surface-hover'
              }`}
            >
              <p className="text-sm font-medium text-body">Write a different response</p>
              {useCustom && (
                <textarea
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  placeholder="Type the response AICA should have given…"
                  rows={2}
                  className="mt-2 w-full resize-none rounded-lg border border-hairline bg-surface px-2.5 py-2 text-sm leading-relaxed text-body transition-colors focus:border-pulse/50 focus:outline-none"
                />
              )}
            </button>
          </div>

          <button
            type="button"
            disabled={!canSave}
            onClick={() =>
              onResolve(action.id, useCustom ? 'custom' : selectedId!, useCustom ? customText.trim() : undefined)
            }
            className="btn-primary mt-3 !px-4 !py-1.5"
          >
            <CheckIcon className="h-3.5 w-3.5" />
            Save as optimal response
          </button>
        </>
      )}
    </div>
  )
}

function ImprovementCard({
  item,
  onSetStatus,
  onAfterChange,
}: {
  item: ImprovementItem
  onSetStatus: (id: string, status: ImprovementStatus) => void
  onAfterChange: (id: string, after: string) => void
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
        <DiffCard
          before={item.before}
          after={item.after}
          onAfterChange={item.status === 'pending' ? (next) => onAfterChange(item.id, next) : undefined}
        />
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
