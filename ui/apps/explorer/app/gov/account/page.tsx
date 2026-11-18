// gov.no-origins.localhost:3000/account, later gov.no-origins.com/account: Your account (agreed 9
// Nov, step 4). Only you see it: your email, your passkeys and where you're signed in. Every change
// here asks for Touch ID first, for exactly that change. Signed out, the sign-in page, which brings
// you back here.
import { redirect } from 'next/navigation'
import { Card, Disclosure, Panes } from '@noi/eio-react'
import { when } from '../../../lib/changes'
import { mailInbox } from '../../../lib/hosts'
import { NOT_ANSWERING, profile } from '../../../lib/governance'
import { waitingCount } from '../../../lib/mero'
import { origins } from '../../../lib/where'
import { cx } from '../../merons/parts'
import { TopBar } from '../../TopBar'
import { GovNav } from '../GovNav'
import { Line } from '../Line'
import { AddPasskey, EmailForm, Passkeys, SignIns, type Row } from './Account'
import styles from '../gov.module.css'
import merons from '../../merons/merons.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Your account · Governance' }

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className="eio-type-style-heading">{title}</h2>
      {children}
    </section>
  )
}

export default async function YourAccount() {
  const [at, p, waiting] = await Promise.all([origins(), profile(), waitingCount()])
  if (!p.ok) {
    if (p.error === NOT_ANSWERING) throw new Error(p.error)
    redirect('/account/sign-in?back=/account')
  }
  const you = p.data
  const owner = you.roles.some(r => r.role === 'owner')
  const nav = <GovNav at={at} owner={owner} handle={you.handle} />
  const chip = cx(merons.chip, 'eio-type-style-label')
  const usedHere = you.sessions.find(s => s.this)?.passkey
  const passkeys: Row[] = you.passkeys.map(k => ({
    id: k.id,
    name: k.id === usedHere ? 'This sign-in used it' : undefined,
    text: k.name,
    said: `added ${when(k.added_at)} · ${k.last_used_at ? `last used ${when(k.last_used_at)}` : 'not used since'}`,
  }))
  const sessions: Row[] = you.sessions.map(s => ({
    id: s.id,
    this: s.this,
    text: s.device,
    said: `signed in ${when(s.started_at)}${s.passkey_name ? ` · with ${s.passkey_name}` : ''}`,
  }))
  return (
    <>
      <TopBar view="gov" waiting={waiting} list={nav} />
      <Panes list={<div className={merons.left}>{nav}</div>}>
        <div className={merons.right}>
          <div className={styles.reading}>
            <div className={styles.head}>
              <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
              <h1 className="eio-type-style-title">Your account</h1>
              <p className={cx(styles.muted, 'eio-type-style-body')}>
                Only you see this page. Each change asks for Touch ID first, for exactly that change, so a sign-in alone can’t make it.
              </p>
            </div>

            <Section title="You">
              <Card>
                <Line
                  text={<strong>{you.display_name}</strong>}
                  caption={<span className="eio-type-style-mono">@{you.handle} · since {day(you.since)}</span>}
                  end={<a className={chip} href={`${at.base}/@${you.handle}`}>Your profile</a>}
                />
              </Card>
            </Section>

            <Section title="Email">
              <Card>
                <Line
                  text={you.email ?? 'No email yet'}
                  caption={you.email
                    ? 'Links for a lost passkey, and notices about your account, go here. Only you and owners see it.'
                    : 'Without one, a lost passkey can’t be replaced, and no notice reaches you when your account changes.'}
                />
              </Card>
              <Disclosure summary={you.email ? 'Change your email' : 'Add your email'}>
                <EmailForm has={Boolean(you.email)} inbox={mailInbox()} />
              </Disclosure>
            </Section>

            <Section title="Passkeys">
              <Passkeys rows={passkeys} />
              <Disclosure summary="Add a passkey">
                <p className={cx(styles.muted, 'eio-type-style-caption')}>
                  For a browser or device that doesn’t share this one’s passwords, or a security key. You confirm with a passkey you have, then make the new one.
                </p>
                <AddPasskey />
              </Disclosure>
            </Section>

            <Section title="Where you’re signed in">
              <SignIns rows={sessions} home={`${at.gov}/`} />
            </Section>
          </div>
        </div>
      </Panes>
    </>
  )
}
