import { create } from 'zustand'
import type { AdditionalContextDoc } from '../types'

interface AgentConfigState {
  additionalContext: AdditionalContextDoc[]
  addAdditionalContext: (docs: AdditionalContextDoc[]) => void
  removeAdditionalContext: (id: string) => void
}

/** The one-off documents attached in Agent Builder's Additional Context
 * stage — a single shared list so Simulation & Testing can show they're in
 * play without threading props between unrelated pages. */
export const useAgentConfigStore = create<AgentConfigState>((set) => ({
  additionalContext: [],
  addAdditionalContext: (docs) =>
    set((s) => ({ additionalContext: [...s.additionalContext, ...docs] })),
  removeAdditionalContext: (id) =>
    set((s) => ({ additionalContext: s.additionalContext.filter((d) => d.id !== id) })),
}))
