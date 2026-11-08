'use client'
// Add an agent, and give an account a role. Each asks for your touch first (Touch ID, in Safari),
// for exactly that action.
import { useActionState, useRef, useState, useTransition } from 'react'
import { Button, Field, Icon, Select, TextArea } from '@noi/eio-react'
import { asserted, requestOptions, touchError } from '../../lib/passkey'
import { finishTouch } from '../review/actions'
import { Message } from '../review/Decide'
import { addAgent, askGovTouch, grantRole, type FormState } from './actions'
import styles from '../review/review.module.css'

type Act = (form: FormData) => void

/** A touch for this action, then the action with it. The form is checked first. */
function useTouch() {
  const [asking, setAsking] = useState<string | null>(null)
  const [failed, setFailed] = useState<string>()
  const [, startTransition] = useTransition()
  async function go(formEl: HTMLFormElement, action: 'add-agent' | 'grant', handle: string | undefined, act: Act) {
    setFailed(undefined)
    if (!formEl.reportValidity()) return
    if (typeof window === 'undefined' || !window.PublicKeyCredential) return setFailed('This browser can’t use passkeys. Open the Explorer in Safari.')
    const started = await askGovTouch(action, handle)
    if (!started.ok) return setFailed(started.error)
    setAsking(started.what)
    let credential
    try {
      credential = await navigator.credentials.get(requestOptions(started.options))
    } catch (e) {
      setAsking(null)
      return setFailed(touchError(e))
    }
    setAsking(null)
    if (!credential) return setFailed('No touch came back.')
    const finished = await finishTouch(started.ceremony, asserted(credential))
    if (!finished.ok) return setFailed(finished.error)
    const form = new FormData(formEl)
    form.set('touch', finished.touch)
    startTransition(() => act(form))
  }
  return { asking, failed, go }
}

function Asking({ what }: { what: string }) {
  return (
    <p className={[styles.message, 'eio-type-style-body'].join(' ')} role="status">
      <Icon name="fingerprint" label="Touch ID" />Touch ID to confirm. Your touch is for {what}, and nothing else.
    </p>
  )
}

const label = (text: string) => <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{text}</span>

export function AddAgentForm({ sponsor }: { sponsor: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAgent, {})
  const { asking, failed, go } = useTouch()
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form ref={ref} className={styles.form} onSubmit={e => e.preventDefault()}>
      <label className={styles.row}>
        {label('Handle')}
        <Field label="Handle" name="handle" defaultValue="claude-code" required pattern="[a-z0-9][a-z0-9-]*" />
      </label>
      <label className={styles.row}>
        {label('Name')}
        <Field label="Name" name="display_name" defaultValue="Claude Code" required />
      </label>
      <label className={styles.row}>
        {label('What it is for')}
        <TextArea name="purpose" rows={2} required defaultValue="Claude, working with you in the No Origins folder on this Mac: proposes changes to Mero, which wait in Review for you." />
      </label>
      <label className={styles.row}>
        {label('Who signs for its runs')}
        <Field label="Who signs for its runs" name="vouched_by" defaultValue="hyperbase:this-mac" required />
        <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
          An agent has no passkey, so each time it starts, the place it runs signs for it: “this is claude-code, started by you, now”.
          Governance accepts only that signer’s key. Hyperbase will do this once it runs agents; until then this Mac does,
          with the key made on 8 Nov. Its name in Governance is hyperbase:this-mac.
        </span>
      </label>
      <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>Sponsor: {sponsor}. You answer for what it does; it acts only through its own runs, never as you.</p>
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : state} />
      <div className={styles.buttons}>
        <Button variant="primary" icon="fingerprint" type="button" disabled={pending || asking !== null} onClick={() => go(ref.current!, 'add-agent', undefined, action)}>
          {pending ? 'Adding…' : asking ? 'Waiting for Touch ID…' : 'Add'}
        </Button>
      </div>
    </form>
  )
}

export function GrantForm({ handles, roles }: { handles: string[]; roles: { path: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(grantRole, {})
  const { asking, failed, go } = useTouch()
  const ref = useRef<HTMLFormElement>(null)
  const [handle, setHandle] = useState(handles.includes('claude-code') ? 'claude-code' : handles[0] ?? '')
  return (
    <form ref={ref} className={styles.form} onSubmit={e => e.preventDefault()}>
      <label className={styles.row}>
        {label('Account')}
        <Select wide name="handle" value={handle} onChange={e => setHandle(e.target.value)} required>
          {handles.map(h => <option key={h} value={h}>{h}</option>)}
        </Select>
      </label>
      <label className={styles.row}>
        {label('Role')}
        <Select wide name="role" defaultValue={roles.find(r => r.path.endsWith('.proposer'))?.path} required>
          {roles.map(r => <option key={r.path} value={r.path}>{r.name}</option>)}
        </Select>
      </label>
      <label className={styles.row}>
        {label('Where: this place and everything under it')}
        <Field label="Where" name="scope" defaultValue="noi" required />
      </label>
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : state} />
      <div className={styles.buttons}>
        <Button variant="primary" icon="fingerprint" type="button" disabled={pending || asking !== null || !handle} onClick={() => go(ref.current!, 'grant', handle, action)}>
          {pending ? 'Granting…' : asking ? 'Waiting for Touch ID…' : 'Grant'}
        </Button>
      </div>
    </form>
  )
}
