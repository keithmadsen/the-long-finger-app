import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

/*
 * The single root error boundary for RENDER-TIME faults only (architecture.md
 * Frontend Architecture — "one React error boundary at the root").
 *
 * Expected API errors are NOT routed here: they are handled inline via TanStack
 * Query's isError state and the <EmptyState variant="failed"> surface (AC 6).
 * This boundary is the last-resort net for a genuine render crash, so the user
 * sees a calm, usable line instead of a blank white page.
 *
 * Class component because error boundaries have no hook equivalent
 * (componentDidCatch / getDerivedStateFromError). No new dependency needed —
 * react-error-boundary would be redundant for this single static fallback.
 */
interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<
  AppErrorBoundaryProps,
  AppErrorBoundaryState
> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the fault for diagnosis; there is no telemetry sink in v1.
    console.error('Unhandled render error:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main>
          <p role="alert">Something went wrong. Refresh to try again.</p>
        </main>
      )
    }

    return this.props.children
  }
}
