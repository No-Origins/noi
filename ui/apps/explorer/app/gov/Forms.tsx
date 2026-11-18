'use client'
// Add an agent; give an account a role, end one, or end its sign-ins. Each asks for your touch first
// (Touch ID, in Safari), for exactly that action.
import { useRouter } from 'next/navigation'
import { useActionState, useRef, useState, useTransition } from 'react'
import { Button, Card, Field, Select, TextArea } from '@noi/eio-react'
import { Message } from '../review/Decide'
import { addAgent, askGovTouch, endRole, endTheirSignIns, grantRole, type FormState } from './actions'
import { Line } from './Line'
import { Asking, useTouch } from './touch'
import styles from '../review/review.module.css'

type Act = (form: FormData) => void

/** A touch for this action, then the action with it. The form is checked first. */
function useFormTouch() {
  const { asking, failed, touch } = useTouch()
  const [, startTransition] = useTransition()
  async function go(formEl: HTMLFormElement, action: 'add-agent' | 'grant', handle: string | undefined, act: Act) {
    if (!formEl.reportValidity()) return
    // What the touch names besides the place (9 Nov, step 7), from the form, as Governance asks it.
    const filled = new FormData(formEl)
    const field = (k: string) => String(filled.get(k) ?? '').trim()
    const about: Record<string, string> = action === 'grant' ? { role: field('role'), scope: field('scope') } : { handle: field('handle') }
    const touched = await touch(() => askGovTouch(action, handle, about))
    if (!touched) return
    const form = new FormData(formEl)
    form.set('touch', touched)
    startTransition(() => act(form))
  }
  return { asking, failed, go }
}

const label = (text: string) => <span className={[styles.muted, 'eio-type-style-label'].join(' ')}>{text}</span>

export function AddAgentForm({ sponsor }: { sponsor: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addAgent, {})
  const { asking, failed, go } = useFormTouch()
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

/** Gives this account a role in a place (on their profile since 9 Nov: you pick the person first,
    by opening their page, then the role). */
export function GrantForm({ handle, roles }: { handle: string; roles: { path: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(grantRole, {})
  const { asking, failed, go } = useFormTouch()
  const ref = useRef<HTMLFormElement>(null)
  return (
    <form ref={ref} className={styles.form} onSubmit={e => e.preventDefault()}>
      <input type="hidden" name="handle" value={handle} />
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
        <Button variant="primary" icon="fingerprint" type="button" disabled={pending || asking !== null} onClick={() => go(ref.current!, 'grant', handle, action)}>
          {pending ? 'Granting…' : asking ? 'Waiting for Touch ID…' : 'Grant'}
        </Button>
      </div>
    </form>
  )
}

/** One owner action that is a button, not a form: a touch for it, then it (9 Nov, step 5). */
function useOneTouch(action: 'end-grant' | 'end-session', handle: string) {
  const router = useRouter()
  const { asking, failed, setFailed, touch } = useTouch()
  const [busy, setBusy] = useState<string>()
  const [done, setDone] = useState<string>()
  async function go(which: string, then: (touched: string) => Promise<{ ok: true; said: string } | { ok: false; error: string }>, about?: Record<string, string>) {
    setDone(undefined)
    setBusy(which)
    const touched = await touch(() => askGovTouch(action, handle, about))
    if (touched) {
      const r = await then(touched)
      if (r.ok) {
        setDone(r.said)
        router.refresh()
      } else setFailed(r.error)
    }
    setBusy(undefined)
  }
  return { asking, failed, busy, done, go }
}

/** This person's roles, each with End for owners: the role stays in Mero; only this grant ends. */
export function RoleLines({ handle, rows }: { handle: string; rows: { grant: string; text: string; said: string }[] }) {
  const { asking, failed, busy, done, go } = useOneTouch('end-grant', handle)
  const end = (row: { grant: string; text: string }) => go(row.grant, async t => {
    const r = await endRole(t, row.grant, handle)
    return r.ok ? { ok: true, said: `${handle} no longer holds ${row.text}.` } : r
  }, { grant: row.grant })
  return (
    <>
      <Card>
        {rows.map(row => (
          <Line
            key={row.grant}
            text={row.text}
            caption={row.said}
            end={<Button icon="fingerprint" disabled={busy !== undefined} onClick={() => end(row)}>{busy === row.grant ? 'Ending…' : 'End'}</Button>}
          />
        ))}
      </Card>
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : { done }} />
    </>
  )
}

/** Ends every sign-in of this person's, and an agent's runs: they sign in again with a passkey. */
export function EndSignIns({ handle, agent }: { handle: string; agent: boolean }) {
  const { asking, failed, busy, done, go } = useOneTouch('end-session', handle)
  const end = () => go('all', async t => {
    const r = await endTheirSignIns(t, handle)
    if (!r.ok) return r
    const n = r.data
    return { ok: true, said: n === 0 ? 'There was nothing to end.' : agent ? `${n} ended: its runs stop now.` : `${n === 1 ? 'Their sign-in' : `${n} sign-ins`} ended.` }
  })
  return (
    <div className={styles.form}>
      <div className={styles.buttons}>
        <Button icon="fingerprint" disabled={busy !== undefined} onClick={end}>{busy ? 'Ending…' : agent ? 'End its runs' : 'End their sign-ins'}</Button>
      </div>
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : { done }} />
    </div>
  )
}
