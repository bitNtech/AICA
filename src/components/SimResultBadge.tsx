import type { SimResult } from '../types'
import { ArrowDownRightIcon, ArrowUpRightIcon, CheckIcon } from './icons'

const CONFIG: Record<SimResult, { label: string; className: string; icon: typeof CheckIcon }> = {
  beat: { label: 'Beat human', className: 'bg-pulse/14 text-pulse', icon: ArrowUpRightIcon },
  matched: { label: 'Matched human', className: 'bg-sage/12 text-sage', icon: CheckIcon },
  worse: { label: 'Worse than human', className: 'bg-amber/15 text-amber', icon: ArrowDownRightIcon },
}

export function SimResultBadge({ result }: { result: SimResult }) {
  const c = CONFIG[result]
  const Icon = c.icon
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${c.className}`}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  )
}
