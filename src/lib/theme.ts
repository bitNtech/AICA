export type Theme = 'light' | 'dark'

const STORAGE_KEY = 'aica-theme'

export function getStoredTheme(): Theme | null {
  const stored = localStorage.getItem(STORAGE_KEY)
  return stored === 'light' || stored === 'dark' ? stored : null
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light'
}

/** Call once, before the first paint, to avoid a flash of the wrong theme. */
export function initTheme(): Theme {
  const theme = getStoredTheme() ?? systemTheme()
  applyTheme(theme)
  return theme
}

export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle('dark', theme === 'dark')
  localStorage.setItem(STORAGE_KEY, theme)
}
