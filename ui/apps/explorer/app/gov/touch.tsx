'use client'
// A touch (Touch ID, in Safari) for exactly one thing, before it is done: adding an agent, giving a
// role, and every change on Your account (shared 9 Nov). Governance opens the prompt for that one
// thing, and the touch it gives back counts once, within a minute, from this sign-in.
import { useState } from 'react'
import { Icon } from '@noi/eio-react'
import type { Started } from '../../lib/governance'
import { asserted, requestOptions, touchError } from '../../lib/passkey'
import { finishTouch } from '../review/actions'
import review from '../review/review.module.css'

/** A touch prompt Governance opened, and what it is for, in words; or why it didn't open one. */
export type Touching = ({ ok: true; what: string } & Started) | { ok: false; error: string }

export function useTouch() {
  const [asking, setAsking] = useState<string | null>(null)
  const [failed, setFailed] = useState<string>()
  /** Opens the prompt `start` asks for, and gives back the touch; undefined, saying why, when none came. */
  async function touch(start: () => Promise<Touching>): Promise<string | undefined> {
    setFailed(undefined)
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      setFailed('This browser can’t use passkeys. Open No Origins in Safari.')
      return
    }
    const started = await start()
    if (!started.ok) return void setFailed(started.error)
    setAsking(started.what)
    let credential
    try {
      credential = await navigator.credentials.get(requestOptions(started.options))
    } catch (e) {
      setAsking(null)
      return void setFailed(touchError(e))
    }
    setAsking(null)
    if (!credential) return void setFailed('No touch came back.')
    const finished = await finishTouch(started.ceremony, asserted(credential))
    if (!finished.ok) return void setFailed(finished.error)
    return finished.touch
  }
  return { asking, failed, setFailed, touch }
}

/** Said while the browser asks for the touch: what it is for, and nothing else. */
export function Asking({ what }: { what: string }) {
  return (
    <p className={[review.message, 'eio-type-style-body'].join(' ')} role="status">
      <Icon name="fingerprint" label="Touch ID" />Touch ID to confirm. Your touch is for {what}, and nothing else.
    </p>
  )
}
