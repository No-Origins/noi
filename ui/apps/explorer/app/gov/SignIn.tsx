'use client'
// Governance's pages in the one app (agreed 8 Nov): sign in with your passkey, sign up, ask for a
// link when a passkey is lost, add a passkey from a one-time link, and sign out. Each passkey step
// happens here, in your browser; the app's server asks Governance, which checks it and makes the
// session.
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button, Card, Disclosure, Field, Icon } from '@noi/eio-react'
import { asserted, creationOptions, registered, requestOptions, touchError } from '../../lib/passkey'
import { Message } from '../review/Decide'
import { confirmNewEmail, finishLink, finishSignIn, leave, startLink, startLost, startSignIn, startSignUp } from './session'
import styles from './gov.module.css'
import review from '../review/review.module.css'

const PASSKEYS = 'This browser can’t use passkeys. Open No Origins in Safari.'

/** A one-time link's token, after its #; null when there is none or it can't be read. */
function tokenIn(hash: string): string | null {
  try {
    return decodeURIComponent(hash.slice(1)) || null
  } catch {
    return null
  }
}
const canUsePasskeys = () => typeof window !== 'undefined' && Boolean(window.PublicKeyCredential)

function Head({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.head}>
      <p className={[styles.muted, 'eio-type-style-label'].join(' ')}>Governance</p>
      <h1 className="eio-type-style-title">{title}</h1>
      {children && <p className={[styles.muted, 'eio-type-style-body'].join(' ')}>{children}</p>}
    </div>
  )
}

function Asking({ children }: { children: React.ReactNode }) {
  return (
    <p className={[review.message, 'eio-type-style-body'].join(' ')} role="status">
      <Icon name="fingerprint" label="Touch ID" />{children}
    </p>
  )
}

/** Where emails go on this Mac, said on the forms that send one. */
export function Inbox({ inbox }: { inbox?: string }) {
  if (!inbox) return null
  return (
    <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>
      On this Mac nothing is really sent: the email waits in the mail catcher, at <a href={inbox}>{inbox.replace(/^https?:\/\//, '')}</a>.
    </p>
  )
}

type Sent = { ok: true; data: string } | { ok: false; error: string }
const value = (form: FormData, name: string) => String(form.get(name) ?? '')

/** A form that asks Governance to email a link, and then says to check your email: one for sign-up
    and a lost passkey, so what they say while sending, on an error and once sent stays the same
    (found 9 Nov). */
function EmailLinkForm({ title, intro, send, inbox, children }: { title: string; intro: string; send: (form: FormData) => Promise<Sent>; inbox?: string; children: ReactNode }) {
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const [said, setSaid] = useState<string>()
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    setSending(true)
    const r = await send(new FormData(e.currentTarget))
    setSending(false)
    if (!r.ok) return setError(r.error)
    setSaid(r.data)
  }
  if (said) {
    return (
      <Card>
        <div className={styles.card}>
          <Head title="Check your email">{said}</Head>
          <Inbox inbox={inbox} />
        </div>
      </Card>
    )
  }
  return (
    <Card>
      <form className={styles.card} onSubmit={submit}>
        <Head title={title}>{intro}</Head>
        {children}
        <Button type="submit" variant="primary" size="large" icon="arrow" wide disabled={sending}>Email me a link</Button>
        <Message state={{ error }} />
      </form>
    </Card>
  )
}

/** Sign up (agreed 8 Nov): your email, a handle and your name. You can look around No Origins once
    the emailed link is opened and your passkey made; owners give more. */
export function SignUpForm({ inbox }: { inbox?: string }) {
  return (
    <>
      <EmailLinkForm
        title="Sign up to No Origins"
        intro="An account to look around: Mero, Review and Eidos. An owner can give you more."
        send={form => startSignUp(value(form, 'email'), value(form, 'handle'), value(form, 'name'))}
        inbox={inbox}
      >
        <Field label="Email" name="email" type="email" placeholder="Your email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
        <Field label="Handle" name="handle" icon="user" placeholder="A handle: lowercase letters, digits, hyphens" autoComplete="username" autoCapitalize="none" spellCheck={false} required pattern="[a-z][a-z0-9\-]{1,38}[a-z0-9]" />
        <Field label="Name" name="name" icon="pen" placeholder="Your name" autoComplete="name" required maxLength={80} />
      </EmailLinkForm>
      <p className={[styles.muted, styles.below, 'eio-type-style-caption'].join(' ')}>
        The link confirms your email and adds your passkey. Your email is never shown to anyone but you and owners.
      </p>
    </>
  )
}

/** A lost passkey: a link to add one, sent to your account's email. */
export function LostForm({ inbox }: { inbox?: string }) {
  return (
    <EmailLinkForm
      title="Lost your passkey?"
      intro="We email a one-time link to your account’s email. It adds a passkey on the device you’re using, and signs you in."
      send={form => startLost(value(form, 'email'))}
      inbox={inbox}
    >
      <Field label="Email" name="email" type="email" placeholder="Your account’s email" autoComplete="email" autoCapitalize="none" spellCheck={false} required />
    </EmailLinkForm>
  )
}

/** Sign in with your passkey, then back to where you were: nothing to type, or your handle when
    the browser can't offer the passkey by itself (agreed 9 Nov). Never with an email, so signing in
    never says whether an email has an account. */
export function SignInForm({ back }: { back: string }) {
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string>()
  // With no handle the browser offers your passkeys for No Origins, and the one you pick says who
  // you are (agreed 9 Nov); with a handle, only that person's.
  async function signIn(handle?: string) {
    setError(undefined)
    if (!canUsePasskeys()) return setError(PASSKEYS)
    const started = await startSignIn(handle)
    if (!started.ok) return setError(started.error)
    setAsking(true)
    let credential
    try {
      credential = await navigator.credentials.get(requestOptions(started.data.options))
    } catch (err) {
      setAsking(false)
      return setError(touchError(err))
    }
    if (!credential) {
      setAsking(false)
      return setError('No passkey came back.')
    }
    const finished = await finishSignIn(started.data.ceremony, asserted(credential))
    setAsking(false)
    if (!finished.ok) return setError(finished.error)
    window.location.assign(back)
  }
  function withHandle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    void signIn(value(new FormData(e.currentTarget), 'handle'))
  }
  return (
    <>
      <Card>
        <div className={styles.card}>
          <Head title="Sign in to No Origins">Once, for Mero, Governance and Eidos. Nothing to type: your browser offers your passkey.</Head>
          <Button variant="primary" size="large" icon="key" wide disabled={asking} onClick={() => void signIn()}>Sign in with a passkey</Button>
          {asking && <Asking>Your browser asks for your passkey.</Asking>}
          <Message state={{ error }} />
          <Disclosure summary="Use your handle instead">
            <form className={styles.card} onSubmit={withHandle}>
              <p className={[styles.muted, 'eio-type-style-caption'].join(' ')}>For a passkey your browser doesn’t offer by itself, such as one on a security key.</p>
              <Field label="Handle" name="handle" icon="user" placeholder="Your handle" autoComplete="username" autoCapitalize="none" spellCheck={false} required />
              <Button type="submit" icon="arrow" disabled={asking}>Sign in</Button>
            </form>
          </Disclosure>
        </div>
      </Card>
      <p className={[styles.muted, styles.below, 'eio-type-style-caption'].join(' ')}>
        No account? <a href="/account/sign-up">Sign up</a>. Lost your passkey? <a href="/account/lost">Email me a link</a>.
      </p>
    </>
  )
}

/** Signed in already: who, where to go, and Sign out. */
export function SignedInCard({ handle, name, back }: { handle: string; name: string; back: string }) {
  const [error, setError] = useState<string>()
  const [leaving, setLeaving] = useState(false)
  async function signOut() {
    setError(undefined)
    setLeaving(true)
    const r = await leave()
    if (!r.ok) {
      setLeaving(false)
      return setError(r.error)
    }
    window.location.reload()
  }
  return (
    <Card>
      <div className={styles.card}>
        <Head title="You’re signed in">As {name} ({handle}), for Mero, Governance and Eidos.</Head>
        <div className={styles.actions}>
          <Button variant="primary" icon="arrow" onClick={() => window.location.assign(back)}>Go on</Button>
          <Button onClick={signOut} disabled={leaving}>Sign out</Button>
        </div>
        <Message state={{ error }} />
      </div>
    </Card>
  )
}

/** A one-time link: make your passkey on this device, and be signed in. The token is after the
    link's #, so it stays in your browser until it goes to Governance in a request's body. */
export function AddPasskeyForm({ home }: { home: string }) {
  const [token, setToken] = useState<string | null>()
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState<string>()
  const [added, setAdded] = useState(false)
  useEffect(() => {
    const read = () => {
      const found = tokenIn(window.location.hash)
      if (found) setToken(found)
      else setToken(t => t ?? null)
      // Out of the address bar and the history at once, whatever happens next (9 Nov).
      if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [])
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(undefined)
    if (!token) return
    if (!canUsePasskeys()) return setError(PASSKEYS)
    const name = String(new FormData(e.currentTarget).get('name') ?? '')
    const started = await startLink(token)
    if (!started.ok) return setError(started.error)
    setAsking(true)
    let credential
    try {
      credential = await navigator.credentials.create(creationOptions(started.data.options))
    } catch (err) {
      setAsking(false)
      return setError(touchError(err))
    }
    if (!credential) {
      setAsking(false)
      return setError('No passkey came back.')
    }
    const finished = await finishLink(started.data.ceremony, registered(credential), name)
    setAsking(false)
    if (!finished.ok) return setError(finished.error)
    // On to Governance's home, which says the passkey is added (agreed 9 Nov). The link left the
    // address bar when the page opened.
    setAdded(true)
    window.location.assign(home)
  }
  if (added) {
    return (
      <Card>
        <div className={styles.card}>
          <Head title="Your passkey is added">You’re signed in. Opening Governance…</Head>
          <div className={styles.actions}>
            <Button variant="primary" icon="arrow" onClick={() => window.location.assign(home)}>Go to Governance</Button>
          </div>
        </div>
      </Card>
    )
  }
  return (
    <Card>
      <form className={styles.card} onSubmit={add}>
        <Head title="Add your passkey">This link works once. Your passkey stays on your device; Governance keeps only its public half.</Head>
        {token === null ? (
          <Message state={{ error: 'This link has no token. Open the whole link you were given.' }} />
        ) : (
          <>
            <Field label="Name this passkey" name="name" icon="key" defaultValue="Touch ID on this Mac" autoComplete="off" required />
            <Button type="submit" variant="primary" size="large" icon="key" wide disabled={asking || token === undefined}>Add a passkey</Button>
            {asking && <Asking>Touch ID to make your passkey.</Asking>}
            <Message state={{ error }} />
          </>
        )}
      </form>
    </Card>
  )
}

/** The link sent to a new email (9 Nov): one press makes it your email, and the old one is told.
    The token is after the link's #, so it stays in your browser until it goes to Governance in a
    request's body; opening the link alone changes nothing, so a mail scanner that opens it can't. */
export function ConfirmEmailForm({ account }: { account: string }) {
  const [token, setToken] = useState<string | null>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState(false)
  useEffect(() => {
    setToken(tokenIn(window.location.hash))
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname)
  }, [])
  async function confirm(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!token) return
    setError(undefined)
    setBusy(true)
    const r = await confirmNewEmail(token)
    setBusy(false)
    if (!r.ok) return setError(r.error)
    setDone(true)
  }
  if (done) {
    return (
      <Card>
        <div className={styles.card}>
          <Head title="Your email is changed">Links for a lost passkey, and notices about your account, go to it now. Your old email was told.</Head>
          <div className={styles.actions}>
            <Button variant="primary" icon="arrow" onClick={() => window.location.assign(account)}>Go to Your account</Button>
          </div>
        </div>
      </Card>
    )
  }
  return (
    <Card>
      <form className={styles.card} onSubmit={confirm}>
        <Head title="Use this email">Make this the email of your No Origins account. This link works once.</Head>
        {token === null ? (
          <Message state={{ error: 'This link has no token. Open the whole link from the email.' }} />
        ) : (
          <>
            <Button type="submit" variant="primary" size="large" icon="check" wide disabled={busy || token === undefined}>Use this email</Button>
            <Message state={{ error }} />
          </>
        )}
      </form>
    </Card>
  )
}
