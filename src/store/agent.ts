import { create } from 'zustand'
import { mockAgentStatus } from '../data/mock'
import type { AgentStatus } from '../types'

interface AgentState {
  status: AgentStatus
  pausedReason: string
  pausedAt: string | null
  /** Switches AICA off — every inbound call routes to the manual front-desk
   * workforce instead until `resume` is called. */
  pause: (reason: string) => void
  resume: () => void
}

export const useAgentStore = create<AgentState>((set) => ({
  status: mockAgentStatus,
  pausedReason: '',
  pausedAt: null,
  pause: (reason) =>
    set({ status: 'paused', pausedReason: reason, pausedAt: new Date().toISOString() }),
  resume: () => set({ status: 'answering', pausedReason: '', pausedAt: null }),
}))
