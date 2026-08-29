import { Component, type ErrorInfo, type ReactNode } from 'react'

interface ErrorBoundaryProps {
  children: ReactNode
  /** Rendered in place of the crashed subtree. Defaults to a full-page
   * fallback; pass a compact one when wrapping a single panel. */
  fallback?: (retry: () => void) => ReactNode
  onError?: (error: Error, info: ErrorInfo) => void
}

interface ErrorBoundaryState {
  error: Error | null
}

/** Catches render/lifecycle errors in its subtree so one component throwing
 * doesn't white-screen the whole app — see FRONTEND_IMPROVEMENTS.md §3.3.
 * Class component because React only supports error boundaries via
 * `getDerivedStateFromError`/`componentDidCatch`, no hook equivalent. */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.props.onError?.(error, info)
  }

  retry = () => this.setState({ error: null })

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    if (this.props.fallback) return this.props.fallback(this.retry)

    return (
      <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm font-medium text-body">Something went wrong.</p>
        <p className="max-w-sm text-xs text-muted">{error.message}</p>
        <button type="button" onClick={this.retry} className="btn-ghost !px-4 !py-1.5 text-xs">
          Try again
        </button>
      </div>
    )
  }
}
