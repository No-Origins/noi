'use client'
// Shown when a page cannot load, most often because Mero's read service is not running.
import { Button } from '@noi/eio-react'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="noi-error">
      <p className="noi-error-muted eio-type-style-label">Explorer</p>
      <h1 className="eio-type-style-title">Mero isn’t answering</h1>
      <p className="eio-type-style-body">
        The Explorer reads Mero through its read service. Start it with <code className="eio-type-style-mono">noi serve</code> in
        the noi folder, then try again.
      </p>
      <Button variant="primary" icon="arrow" onClick={reset}>Try again</Button>
    </main>
  )
}
