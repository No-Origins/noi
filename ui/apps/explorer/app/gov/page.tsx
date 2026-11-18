// gov.no-origins.localhost:3000/, later gov.no-origins.com/: Governance's home (agreed 9 Nov), a
// dashboard that shows what fits whoever is looking. Signed out: what Governance is, and Sign in or
// Sign up. Signed in: you and your roles, and every role in one sentence. Owners also see how many
// hold each role, the latest changes and what needs attention. No forms: a role is given on the
// person's profile, an agent added on Accounts.
import { Button, Card, Panes } from '@noi/eio-react'
import { readCedar } from '../../lib/cedar'
import { changeWords, when } from '../../lib/changes'
import { dashboard, type Dashboard, type Held } from '../../lib/governance'
import { govSnapshot, meroProblems, waitingCount, type Meron } from '../../lib/mero'
import { plain, roleSentence, type RoleForm } from '../../lib/sentence'
import { origins } from '../../lib/where'
import { cx } from '../merons/parts'
import { TopBar } from '../TopBar'
import { GovNav } from './GovNav'
import { Line } from './Line'
import styles from './gov.module.css'
import merons from '../merons/merons.module.css'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Governance' }

const DAY = 24 * 60 * 60 * 1000
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
/** A link that ends a line: a chip, so its target is the Eidos minimum (fit rule 4). */
const chip = cx(merons.chip, 'eio-type-style-label')

function Head({ children }: { children?: React.ReactNode }) {
  return (
    <div className={styles.head}>
      <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
      <h1 className="eio-type-style-title">Who may do what, and where</h1>
      <p className={cx(styles.muted, 'eio-type-style-body')}>
        Governance keeps No Origins’ accounts and roles, and answers one question for every system: may this person or agent do this, here?
      </p>
      {children}
    </div>
  )
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className="eio-type-style-heading">{title}</h2>
      {children}
      {note && <p className={cx(styles.muted, 'eio-type-style-caption')}>{note}</p>}
    </section>
  )
}

/** Signed out: what Governance is, and the two ways in. */
function SignedOutHome({ problem }: { problem?: string }) {
  return (
    <main className={cx(styles.page, styles.reading)}>
      <Head />
      <div className={styles.actions}>
        <Button variant="primary" size="large" icon="key" href="/account/sign-in?back=/">Sign in with a passkey</Button>
        <Button size="large" href="/account/sign-up">Sign up</Button>
      </div>
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        Roles and rules are merons in Mero, changed through Review like anything else; Governance enforces its own copy of them.
      </p>
      {problem && <p className={cx(styles.muted, 'eio-type-style-caption')}>{problem}</p>}
    </main>
  )
}

/** Your roles: which, where, and from whom. */
function yourRoles(roles: Held[], names: Record<string, string>) {
  if (!roles.length) return <Line text="You hold no role yet. An owner can give you one." />
  return roles.map(r => (
    <Line
      key={r.grant}
      text={`${names[r.role] ?? capital(r.role)}, in ${r.scope}`}
      caption={r.granted_by ? `given by ${r.granted_by}, ${date(r.granted_at)}` : `since ${date(r.granted_at)}`}
    />
  ))
}

export default async function Home({ searchParams }: { searchParams: Promise<{ passkey?: string }> }) {
  const [at, d, { passkey }] = await Promise.all([origins(), dashboard(), searchParams])
  if (!d.ok || !d.data.you) {
    return (
      <>
        <TopBar view="gov" />
        <SignedOutHome problem={d.ok ? undefined : d.error} />
      </>
    )
  }
  const { you, view, held, changes, attention }: Dashboard = d.data
  if (!you) return null
  // The roles themselves are merons in Mero: read them as Mero lets you, and say each in words.
  let roleMerons: Meron[] = []
  try {
    // Only noi.gov's merons, not the whole registry (9 Nov, step 6).
    const s = await govSnapshot()
    roleMerons = s.merons.filter(m => m.identity.path.startsWith('noi.gov.roles.') && m.lifecycle.state === 'active')
  } catch {
    // Refused, or Mero down: Governance's home works without the roles in words (9 Nov, step 6).
  }
  const [cedar, waiting, mero] = await Promise.all([
    roleMerons.length ? readCedar(roleMerons) : undefined,
    waitingCount(),
    view ? meroProblems() : undefined,
  ])
  const names = Object.fromEntries(roleMerons.map(m => [m.identity.path.slice('noi.gov.roles.'.length), m.identity.name]))
  const meroToday = mero?.ok ? mero.data.filter(p => Date.now() - new Date(p.at).getTime() < DAY).length : 0
  const problems = (attention?.problems_today ?? 0) + meroToday
  const nav = <GovNav at={at} owner={Boolean(view)} handle={you.handle} />
  return (
    <>
      <TopBar view="gov" waiting={waiting} list={nav} />
      <Panes list={<div className={merons.left}>{nav}</div>}>
        <div className={merons.right}>
          <div className={styles.reading}>
            <Head>
              {passkey === 'added' && (
                <p className="eio-type-style-body" role="status">Your passkey is added, and you’re signed in. Next time, sign in with it.</p>
              )}
            </Head>

            <Section title="You">
              <Card>
                <Line
                  text={<strong>{you.display_name}</strong>}
                  caption={<span className="eio-type-style-mono">@{you.handle} · {you.kind === 'agent' ? 'an agent' : 'a person'}</span>}
                  end={<a className={chip} href={`${at.gov}/account`}>Your account</a>}
                />
                {yourRoles(you.roles, names)}
              </Card>
            </Section>

            {roleMerons.length > 0 && (
              <Section title="The roles" note="A role does nothing until it is given somewhere: in a place, and everything under it.">
                <Card>
                  {roleMerons.map((m, i) => {
                    const id = m.identity.path.slice('noi.gov.roles.'.length)
                    const reading = cedar?.readings[i]
                    const words = reading && 'form' in reading ? plain(roleSentence(reading.form as RoleForm)) : 'Written in Cedar by hand: see the role.'
                    // How many hold it, for those who may view who holds what (owners).
                    const count = view ? (held?.[m.identity.path] ?? 0) : undefined
                    return (
                      <Line
                        key={m.identity.path}
                        name={m.identity.name}
                        text={words}
                        caption={count === undefined ? undefined : count ? `held by ${plural(count, 'account')}` : 'held by no one'}
                        end={<a className={chip} href={`${at.gov}/roles#${id}`}>See role</a>}
                      />
                    )
                  })}
                </Card>
              </Section>
            )}

            {view && changes && (
              <Section title="Recent changes">
                {changes.length ? (
                  <Card>
                    {changes.map(c => <Line key={c.seq} text={changeWords(c, names)} caption={when(c.at)} />)}
                  </Card>
                ) : (
                  <p className="eio-type-style-body">Nothing has changed yet.</p>
                )}
              </Section>
            )}

            {view && attention && (
              <Section title="Needs attention">
                <Card>
                  <Line
                    text={attention.waiting.length
                      ? `${plural(attention.waiting.length, 'account')} ${attention.waiting.length === 1 ? 'waits' : 'wait'} for a first passkey: ${attention.waiting.join(', ')}`
                      : 'No account waits for a first passkey.'}
                    end={<a className={chip} href={`${at.gov}/accounts`}>Accounts</a>}
                  />
                  <Line
                    text={problems ? `${plural(problems, 'problem')} kept in the last day` : 'Nothing failed in the last day.'}
                    caption={mero && !mero.ok ? `Mero didn’t say: ${mero.error}` : undefined}
                    end={<a className={chip} href={`${at.gov}/problems`}>Problems</a>}
                  />
                </Card>
              </Section>
            )}
          </div>
        </div>
      </Panes>
    </>
  )
}
