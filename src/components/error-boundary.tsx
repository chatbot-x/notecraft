'use client'

import React from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Optional fallback UI; receives the error and a retry callback */
  fallback?: (error: Error, retry: () => void) => React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
  retryKey: number
}

/**
 * React Error Boundary for crash recovery.
 *
 * Wraps the main application so that an unhandled rendering error doesn't
 * blank the entire screen. Instead it shows a user-friendly message with a
 * "Try again" button that resets the boundary state and forces a remount
 * of children via a key change.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <NoteApp />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null, retryKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log the error in development only (respects the logger pattern)
    if (process.env.NODE_ENV === 'development') {
      console.error('[ErrorBoundary] Uncaught error:', error, errorInfo)
    }
  }

  handleRetry = () => {
    // Increment retryKey to force children to remount, clearing any
    // corrupted internal state that caused the original error.
    this.setState((prev) => ({ hasError: false, error: null, retryKey: prev.retryKey + 1 }))
  }

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry)
      }

      return (
        <div className="flex items-center justify-center h-screen w-screen bg-background">
          <div className="flex flex-col items-center gap-6 max-w-md p-8 text-center">
            <div className="rounded-2xl bg-destructive/10 p-4">
              <AlertTriangle className="h-10 w-10 text-destructive" />
            </div>
            <div>
              <h2 className="text-lg font-semibold mb-2">Something went wrong</h2>
              <p className="text-sm text-muted-foreground mb-1">
                An unexpected error occurred. Your notes are safe — they are stored locally in your browser.
              </p>
              {process.env.NODE_ENV === 'development' && (
                <pre className="mt-3 text-left text-xs bg-muted p-3 rounded-md overflow-auto max-h-32 text-destructive">
                  {this.state.error.message}
                </pre>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={this.handleRetry} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={() => window.location.reload()}
              >
                Reload page
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return <div key={this.state.retryKey}>{this.props.children}</div>
  }
}
