'use client'
// The controls that decide: approve a whole batch, or approve, send back or reject one change.
// Each asks for your touch first (Touch ID, in Safari): Governance needs a fresh one, for exactly
// the merons the decision covers, and it counts once.
import { useActionState, useRef, useState, useTransition } from 'react'
import { Button, Field, Icon } from '@noi/eio-react'
import { approve, reject, sendBack, type ActionState, type Decision } from './actions'
import { touchFor } from './touch'
import styles from './review.module.css'

export function Message({ state }: { state: ActionState }) {
  return (
    <>
      {state.error && (
        <p className={[styles.message, styles.error, 'eio-type-style-body'].join(' ')} role="alert">
          <Icon name="x" label="Failed" />{state.error}
        </p>
      )}
      {state.done && (
        <p className={[styles.message, styles.done, 'eio-type-style-body'].join(' ')} role="status">
          <Icon name="check" label="Done" />{state.done}
        </p>
      )}
    </>
  )
}

/** While Touch ID is asking: what your touch is for. */
function Asking({ places }: { places: string[] }) {
  return (
    <div className={[styles.message, 'eio-type-style-body'].join(' ')} role="status">
      <Icon name="fingerprint" label="Touch ID" />
      <span>
        Touch ID to confirm. Your touch is for these, and nothing else:{' '}
        <span className="eio-type-style-mono">{places.join(' · ')}</span>
      </span>
    </div>
  )
}

type Act = (form: FormData) => void

/** Asks for a touch, then runs the decision with it. A note, where one is needed, is checked first. */
function useTouched() {
  const [asking, setAsking] = useState<string[] | null>(null)
  const [failed, setFailed] = useState<string>()
  const [, startTransition] = useTransition()
  async function decide(decision: Decision, proposals: string[], form: FormData, act: Act) {
    setFailed(undefined)
    const t = await touchFor(decision, proposals, setAsking)
    setAsking(null)
    if ('error' in t) {
      setFailed(t.error)
      return
    }
    form.set('touch', t.touch)
    startTransition(() => act(form))
  }
  return { asking, failed, decide }
}

/** Approve every waiting change in the batch, in one transaction. */
export function ApproveAll({ proposals, blocked }: { proposals: string[]; blocked?: string }) {
  const [state, action, pending] = useActionState(approve, {})
  const { asking, failed, decide } = useTouched()
  const busy = pending || asking !== null
  return (
    <div className={styles.row}>
      <Button
        variant="primary"
        icon="fingerprint"
        disabled={busy || Boolean(blocked)}
        onClick={() => {
          const form = new FormData()
          proposals.forEach(p => form.append('proposal', p))
          decide('approve', proposals, form, action)
        }}
      >
        {pending ? 'Approving…' : asking ? 'Waiting for Touch ID…' : 'Approve all'}
      </Button>
      {blocked && <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{blocked}</p>}
      {asking && <Asking places={asking} />}
      <Message state={failed ? { error: failed } : state} />
    </div>
  )
}

/** One change's decision. A note is required to send back or reject. */
export function Decide({ proposal, waiting, blocked }: { proposal: string; waiting: boolean; blocked?: string }) {
  const [approved, approveAction, approving] = useActionState(approve, {})
  const [returned, sendBackAction, returning] = useActionState(sendBack, {})
  const [rejected, rejectAction, rejecting] = useActionState(reject, {})
  const { asking, failed, decide } = useTouched()
  const formRef = useRef<HTMLFormElement>(null)
  const busy = approving || returning || rejecting || asking !== null
  const approveIt = () => decide('approve', [proposal], new FormData(formRef.current!), approveAction)
  // Sending back and rejecting need a note; it is checked before Touch ID asks.
  const [noteNeeded, setNoteNeeded] = useState(false)
  const withNote = (decision: Decision, act: Act) => {
    const form = new FormData(formRef.current!)
    if (!String(form.get('note') ?? '').trim()) {
      setNoteNeeded(true)
      return
    }
    setNoteNeeded(false)
    decide(decision, [proposal], form, act)
  }
  return (
    <div className={styles.row}>
      <form ref={formRef} className={styles.decision} onSubmit={e => e.preventDefault()}>
        <input type="hidden" name="proposal" value={proposal} />
        {waiting && (
          <Button variant="primary" icon="fingerprint" disabled={busy || Boolean(blocked)} onClick={approveIt}>
            Approve
          </Button>
        )}
        <Field className={styles.note} label="Note for the proposer" name="note" placeholder="A note: what to change, or why not" />
        {waiting && (
          <Button variant="secondary" icon="left" disabled={busy} onClick={() => withNote('send-back', sendBackAction)}>
            Send back
          </Button>
        )}
        <Button icon="x" disabled={busy} onClick={() => withNote('reject', rejectAction)}>Reject</Button>
      </form>
      {blocked && waiting && <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{blocked}</p>}
      {asking && <Asking places={asking} />}
      {noteNeeded && <Message state={{ error: 'Write a note first: it tells the proposer what to change, or why not.' }} />}
      {failed && <Message state={{ error: failed }} />}
      <Message state={approved} />
      <Message state={returned} />
      <Message state={rejected} />
    </div>
  )
}
