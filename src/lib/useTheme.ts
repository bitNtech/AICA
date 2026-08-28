import { useEffect, useState } from 'react'
import type { Theme } from './theme'

/** Tracks the live `.dark` class on <html> so components outside TopBar
 * (e.g. third-party libraries like React Flow that need an explicit
 * color-mode prop) can react to theme changes made elsewhere. */
export function useTheme(): Theme {
  const [theme, setTheme] = useState<Theme>(() =>
    document.documentElement.classList.contains('dark') ? 'dark' : 'light',
  )

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setTheme(document.documentElement.classList.contains('dark') ? 'dark' : 'light')
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])

  return theme
}
