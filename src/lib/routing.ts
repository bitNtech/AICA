import { footerNav, primaryNav, supportNav } from '../data/mock'
import type { CallLogSeed } from '../types'

const ALL_NAV = [...primaryNav, ...footerNav, ...supportNav]

/** Reverse-looks-up a nav id from the current pathname, so the active rail
 * item and page title derive from the URL rather than duplicated state. */
export function pathToNavId(pathname: string): string {
  return ALL_NAV.find((n) => n.href === pathname)?.id ?? 'dashboard'
}

export function callLogSeedToSearchParams(seed: CallLogSeed): URLSearchParams {
  const params = new URLSearchParams()
  if (seed.search) params.set('q', seed.search)
  if (seed.outcome) params.set('outcome', seed.outcome)
  if (seed.confidence) params.set('confidence', seed.confidence)
  return params
}

export function searchParamsToCallLogSeed(params: URLSearchParams): CallLogSeed {
  const seed: CallLogSeed = {}
  const q = params.get('q')
  const outcome = params.get('outcome')
  const confidence = params.get('confidence')
  if (q) seed.search = q
  if (outcome) seed.outcome = outcome as CallLogSeed['outcome']
  if (confidence) seed.confidence = confidence as CallLogSeed['confidence']
  return seed
}
