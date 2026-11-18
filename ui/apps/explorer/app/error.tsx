'use client'
// Shown when a page cannot load: Mero or Governance didn't answer, or failed. The words name no
// command hosted; on this Mac they say how to start them (architecture review, 9 Nov).
import { useEffect, useState } from 'react'
import { Button } from '@noi/eio-react'

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  const [local, setLocal] = useState(false)
  useEffect(() => setLocal(window.location.hostname.endsWith('.localhost') || window.location.hostname === 'localhost'), [])
  return (
    <main className="noi-error">
      <p className="noi-error-muted eio-type-style-label">No Origins</p>
      <h1 className="eio-type-style-title">This page couldn’t load</h1>
      <p className="eio-type-style-body">Mero or Governance didn’t answer, or failed. Try again in a moment.</p>
      {local && (
        <p className="noi-error-muted eio-type-style-caption">
          On this Mac: start Mero with <code className="eio-type-style-mono">noi serve</code> and Governance with <code className="eio-type-style-mono">noi gov serve</code>, or their launch settings.
        </p>
      )}
      <Button variant="primary" icon="arrow" onClick={reset}>Try again</Button>
    </main>
  )
}
