'use client'

import { useEffect } from 'react'

/**
 * Suppresses cross-origin SecurityError that React DevTools throws
 * when the app is loaded inside an iframe (e.g., the preview panel).
 *
 * The error "Failed to read a named property '$$typeof' from 'Window'"
 * is a harmless side effect of React DevTools trying to inspect
 * cross-origin frame properties. It doesn't affect functionality.
 */
export function IframeErrorHandler() {
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      if (
        event.message?.includes('$$typeof') ||
        event.message?.includes('cross-origin frame') ||
        (event.error instanceof DOMException && event.error.name === 'SecurityError')
      ) {
        event.stopImmediatePropagation()
        event.preventDefault()
        return true
      }
    }

    window.addEventListener('error', handler, true)
    // Also catch unhandled promise rejections from the same cause
    const rejectionHandler = (event: PromiseRejectionEvent) => {
      const reason = event.reason
      if (
        reason?.message?.includes('$$typeof') ||
        reason?.message?.includes('cross-origin frame') ||
        (reason instanceof DOMException && reason.name === 'SecurityError')
      ) {
        event.stopImmediatePropagation()
        event.preventDefault()
      }
    }
    window.addEventListener('unhandledrejection', rejectionHandler, true)

    return () => {
      window.removeEventListener('error', handler, true)
      window.removeEventListener('unhandledrejection', rejectionHandler, true)
    }
  }, [])

  return null
}
