import type { ReactNode } from 'react'

/** Lightweight, no-dependency tooltip — shown on hover/focus so it works
 * for keyboard users too, not just mouse. */
export function Tooltip({
  content,
  children,
  className = '',
}: {
  content: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <span className={`group relative inline-flex ${className}`}>
      {children}
      <span
        role="tooltip"
        className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink-teal px-2 py-1 font-mono text-xs text-mist opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100 dark:bg-mist dark:text-ink-teal"
      >
        {content}
      </span>
    </span>
  )
}
