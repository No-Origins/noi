'use client'
// Deciding a change to roles and rules in Review (step 3): approve, send back or reject, each with
// your touch first (Touch ID, in Safari), made for exactly that decision on this proposal. Sending
// back and rejecting need a note, checked before Touch ID asks. Governance decides.
import { useActionState, useRef, useState, useTransition } from 'react'
import { Button, Field } from '@noi/eio-react'
import type { GovDecision } from '../../lib/governance'
import { Asking, useTouch } from '../gov/touch'
import { Message } from './Decide'
import { askGovDecisionTouch, decideGov } from './gov-actions'
import styles from './review.module.css'

export function GovDecide({ proposal, path, blocked }: { proposal: string; path: string; blocked?: string }) {
  const [state, action, deciding] = useActionState(decideGov, {})
  const { asking, failed, touch } = useTouch()
  const [, startTransition] = useTransition()
  const [noteNeeded, setNoteNeeded] = useState(false)
  const formRef = useRef<HTMLFormElement>(null)
  const busy = deciding || asking !== null
  async function decide(decision: GovDecision) {
    const form = new FormData(formRef.current!)
    if (decision !== 'approve' && !String(form.get('note') ?? '').trim()) return setNoteNeeded(true)
    setNoteNeeded(false)
    const touched = await touch(() => askGovDecisionTouch(proposal, path, decision))
    if (!touched) return
    form.set('decision', decision)
    form.set('touch', touched)
    startTransition(() => action(form))
  }
  return (
    <div className={styles.row}>
      <form ref={formRef} className={styles.decision} onSubmit={e => e.preventDefault()}>
        <input type="hidden" name="proposal" value={proposal} />
        <Button className={styles.act} variant="primary" icon="fingerprint" disabled={busy || Boolean(blocked)} onClick={() => decide('approve')}>
          {deciding ? 'Deciding…' : asking ? 'Waiting for Touch ID…' : 'Approve'}
        </Button>
        <Field className={styles.note} label="Note for the proposer" name="note" placeholder="A note: what to change, or why not" />
        <Button className={styles.act} variant="secondary" icon="left" disabled={busy} onClick={() => decide('send-back')}>Send back</Button>
        <Button className={styles.act} icon="x" disabled={busy} onClick={() => decide('reject')}>Reject</Button>
      </form>
      {blocked && <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{blocked}</p>}
      {asking && <Asking what={asking} />}
      {noteNeeded && <Message state={{ error: 'Write a note first: it tells the proposer what to change, or why not.' }} />}
      {failed && <Message state={{ error: failed }} />}
      <Message state={state} />
    </div>
  )
}
