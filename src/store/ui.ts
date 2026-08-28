import type { ReactNode } from 'react'
import { create } from 'zustand'

interface DrawerContent {
  title: string
  subtitle?: string
  body: ReactNode
}

interface UiState {
  drawer: DrawerContent | null
  openDrawer: (content: DrawerContent) => void
  closeDrawer: () => void
}

/** The single slide-in drawer mechanism used everywhere — see ContextDrawer. */
export const useUiStore = create<UiState>((set) => ({
  drawer: null,
  openDrawer: (content) => set({ drawer: content }),
  closeDrawer: () => set({ drawer: null }),
}))
