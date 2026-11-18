'use client'
// Your account's changes (agreed 9 Nov, step 4): add a passkey, remove one, end sign-ins and change
// your email. Each asks for Touch ID for exactly that change first, so a sign-in alone can't make it.
import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { Button, Card, Field } from '@noi/eio-react'
import { creationOptions, registered, touchError } from '../../../lib/passkey'
import { Message } from '../../review/Decide'
import { Line } from '../Line'
import { leave } from '../session'
import { Inbox } from '../SignIn'
import { Asking, useTouch } from '../touch'
import { askOwnTouch, changeEmail, endSignIns, finishAddPasskey, removePasskey, startAddPasskey } from './actions'
import styles from '../gov.module.css'

/** One row, as the page wrote it: dates are said on the server, so they read the same everywhere. */
export interface Row { id: string; text: string; said: string; name?: string; this?: boolean }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/** Your passkeys, each with Remove once you have two. Never the one you confirm with: Governance
    says so if you try, so a passkey that works always stays (agreed 9 Nov). */
export function Passkeys({ rows }: { rows: Row[] }) {
  const router = useRouter()
  const { asking, failed, setFailed, touch } = useTouch()
  const [busy, setBusy] = useState<string>()
  const [said, setSaid] = useState<string>()
  async function remove(row: Row) {
    setSaid(undefined)
    setBusy(row.id)
    const touched = await touch(() => askOwnTouch({ change: 'remove-passkey', passkey: row.id }))
    if (touched) {
      const r = await removePasskey(touched, row.id)
      if (!r.ok) setFailed(r.error)
      else {
        const ended = r.data.sign_ins_ended
        setSaid(`${row.text} is removed${ended ? `, and the ${plural(ended, 'sign-in')} it made ended` : ''}.`)
        router.refresh()
      }
    }
    setBusy(undefined)
  }
  return (
    <>
      <Card>
        {rows.map(row => (
          <Line
            key={row.id}
            name={row.name}
            text={row.text}
            caption={row.said}
            end={rows.length > 1 && (
              <Button icon="fingerprint" disabled={busy !== undefined} onClick={() => remove(row)}>
                {busy === row.id ? 'Removing…' : 'Remove'}
              </Button>
            )}
          />
        ))}
      </Card>
      {rows.length > 1 && (
        <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
          Confirm with a passkey you keep: the one you remove can’t confirm its own removal. The sign-ins it made end with it.
        </p>
      )}
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : { done: said }} />
    </>
  )
}

/** Another passkey, while signed in: confirm with one you have, then make the new one where your
    browser offers to keep it. Your email is told (agreed 9 Nov, Q). */
export function AddPasskey() {
  const router = useRouter()
  const { asking, failed, setFailed, touch } = useTouch()
  const form = useRef<HTMLFormElement>(null)
  const [step, setStep] = useState<'touch' | 'make'>()
  const [said, setSaid] = useState<string>()
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaid(undefined)
    const name = String(new FormData(e.currentTarget).get('name') ?? '').trim()
    setStep('touch')
    try {
      const touched = await touch(() => askOwnTouch({ change: 'add-passkey' }))
      if (!touched) return
      const started = await startAddPasskey(touched)
      if (!started.ok) return setFailed(started.error)
      setStep('make')
      let credential
      try {
        credential = await navigator.credentials.create(creationOptions(started.data.options))
      } catch (err) {
        return setFailed(
          (err as { name?: string })?.name === 'InvalidStateError'
            ? 'That place already keeps one of your passkeys, so it made no second one. Choose another, such as a security key or another browser’s passwords.'
            : touchError(err),
        )
      }
      if (!credential) return setFailed('No passkey came back.')
      const finished = await finishAddPasskey(started.data.ceremony, registered(credential), name)
      if (!finished.ok) return setFailed(finished.error)
      setSaid(`${name} is added. Your email gets a notice of it.`)
      form.current?.reset()
      router.refresh()
    } finally {
      setStep(undefined)
    }
  }
  return (
    <form ref={form} className={styles.card} onSubmit={add}>
      <Field label="Name the new passkey" name="name" icon="key" placeholder="Such as: Security key" autoComplete="off" required maxLength={80} />
      <div className={styles.actions}>
        <Button type="submit" icon="fingerprint" disabled={step !== undefined}>{step ? 'Adding…' : 'Add a passkey'}</Button>
      </div>
      {asking && <Asking what={asking} />}
      {step === 'make' && (
        <p className="eio-type-style-body" role="status">Now make the new passkey: your browser asks where to keep it.</p>
      )}
      <Message state={failed ? { error: failed } : { done: said }} />
    </form>
  )
}

/** Where you're signed in: this one signs out with no touch; ending any other needs one, so a
    stolen sign-in can't end yours (9 Nov). */
export function SignIns({ rows, home }: { rows: Row[]; home: string }) {
  const router = useRouter()
  const { asking, failed, setFailed, touch } = useTouch()
  const [busy, setBusy] = useState<string>()
  const [said, setSaid] = useState<string>()
  const others = rows.filter(r => !r.this).length
  async function end(row?: Row) {
    setSaid(undefined)
    setBusy(row?.id ?? 'others')
    const touched = await touch(() => askOwnTouch(row ? { change: 'end-sign-in', session: row.id } : { change: 'end-other-sign-ins' }))
    if (touched) {
      const r = await endSignIns(touched, row?.id)
      if (!r.ok) setFailed(r.error)
      else {
        setSaid(row ? `The sign-in in ${row.text} ended.` : `${plural(r.data.ended, 'other sign-in')} ended.`)
        router.refresh()
      }
    }
    setBusy(undefined)
  }
  async function signOut() {
    setBusy('this')
    const r = await leave()
    if (!r.ok) {
      setBusy(undefined)
      return setFailed(r.error)
    }
    window.location.assign(home)
  }
  return (
    <>
      <Card>
        {rows.map(row => (
          <Line
            key={row.id}
            name={row.this ? 'This sign-in' : undefined}
            text={row.text}
            caption={row.said}
            end={row.this ? (
              <Button disabled={busy !== undefined} onClick={signOut}>Sign out</Button>
            ) : (
              <Button icon="fingerprint" disabled={busy !== undefined} onClick={() => end(row)}>{busy === row.id ? 'Ending…' : 'End'}</Button>
            )}
          />
        ))}
      </Card>
      {others > 1 && (
        <div className={styles.actions}>
          <Button icon="fingerprint" disabled={busy !== undefined} onClick={() => end()}>
            {busy === 'others' ? 'Ending…' : 'End your other sign-ins'}
          </Button>
        </div>
      )}
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : { done: said }} />
    </>
  )
}

/** A new email: a link goes to it, and it becomes yours when the link is opened. The old one is
    told then. */
export function EmailForm({ has, inbox }: { has: boolean; inbox?: string }) {
  const { asking, failed, setFailed, touch } = useTouch()
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<string>()
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaid(undefined)
    const email = String(new FormData(e.currentTarget).get('email') ?? '')
    setBusy(true)
    const touched = await touch(() => askOwnTouch({ change: 'change-email', email }))
    if (touched) {
      const r = await changeEmail(touched, email)
      if (r.ok) setSaid(r.data)
      else setFailed(r.error)
    }
    setBusy(false)
  }
  return (
    <form className={styles.card} onSubmit={send}>
      <Field label={has ? 'Your new email' : 'Your email'} name="email" type="email" placeholder={has ? 'Your new email' : 'Your email'} autoComplete="email" autoCapitalize="none" spellCheck={false} required />
      <div className={styles.actions}>
        <Button type="submit" icon="fingerprint" disabled={busy}>Email me a link</Button>
      </div>
      {asking && <Asking what={asking} />}
      <Message state={failed ? { error: failed } : { done: said }} />
      <Inbox inbox={inbox} />
    </form>
  )
}
