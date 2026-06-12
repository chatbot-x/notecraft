'use client'

import dynamic from 'next/dynamic'
import { ErrorBoundary } from '@/components/error-boundary'

const NoteApp = dynamic(() => import('@/components/note-app').then((mod) => ({ default: mod.NoteApp })), {
  ssr: false,
  loading: () => (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      <div className="w-72 border-r border-border bg-card animate-pulse" />
      <div className="flex-1 flex items-center justify-center">
        <div className="text-muted-foreground text-sm">Loading NoteCraft...</div>
      </div>
    </div>
  ),
})

export default function Home() {
  return (
    <ErrorBoundary>
      <NoteApp />
    </ErrorBoundary>
  )
}
