// no-origins.localhost:3000/@<handle>, later no-origins.com/@<handle>: someone's profile, the link
// to share (agreed 9 Nov; fleshed out in step 5). Everyone sees name, handle, person or agent and
// since when, and for an agent who sponsors it and what it is for. Roles show to owners and to the
// person themselves. Owners also see passkeys by name, sign-ins or an agent's runs, and their part
// of the record; and give a role, end one, or end their sign-ins here, each with Touch ID.
// The front desk shows this folder for /@handle on the base name; a folder can't start with @.
import { notFound } from 'next/navigation'
import { Badge, Card } from '@noi/eio-react'
import { rolesIn } from '../../../lib/cedar'
import { when } from '../../../lib/changes'
import { accountOf, person, profile, signedIn, type AccountView, type Held, type Person } from '../../../lib/governance'
import { govSnapshot, type Snapshot } from '../../../lib/mero'
import { origins } from '../../../lib/where'
import { EndSignIns, GrantForm, RoleLines } from '../../gov/Forms'
import { Line } from '../../gov/Line'
import { cx } from '../../merons/parts'
import { TopBar } from '../../TopBar'
import styles from '../../gov/gov.module.css'
import merons from '../../merons/merons.module.css'

export const dynamic = 'force-dynamic'

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export async function generateMetadata({ params }: { params: Promise<{ handle: string }> }) {
  return { title: `@${decodeURIComponent((await params).handle)}` }
}

function Section({ title, children, note }: { title: string; children: React.ReactNode; note?: string }) {
  return (
    <section className={styles.section}>
      <h2 className="eio-type-style-heading">{title}</h2>
      {note && <p className={cx(styles.muted, 'eio-type-style-caption')}>{note}</p>}
      {children}
    </section>
  )
}

export default async function Profile({ params }: { params: Promise<{ handle: string }> }) {
  const handle = decodeURIComponent((await params).handle)
  const [at, you, owned, open] = await Promise.all([origins(), signedIn(), accountOf(handle), person(handle)])
  // Owners see the account as Governance keeps it; everyone else, its public part.
  const full: AccountView | undefined = owned.ok ? owned.data : undefined
  const shown: Person | undefined = full ?? (open.ok ? open.data : undefined)
  if (!shown) notFound()
  const yours = you?.handle === shown.handle
  // Your own roles show on your own profile (agreed 9 Nov), owner or not.
  const mine = yours && !full ? await profile() : undefined
  const roles: Held[] | undefined = full?.roles ?? (mine?.ok ? mine.data.roles : undefined)
  let s: Snapshot | undefined
  if (roles) {
    try {
      s = await govSnapshot()
    } catch {
      // Refused, or Mero down: the profile shows roles by their ID.
    }
  }
  const known = s ? rolesIn(s) : []
  const names = Object.fromEntries(known.map(r => [r.id, r.name]))
  const offered = known.map(r => ({ path: `noi.gov.roles.${r.id}`, name: r.name }))
  const agent = shown.kind === 'agent'
  const what = agent ? 'An agent' : shown.kind === 'person' ? 'A person' : 'Everyone signed out'
  const sponsor = full?.sponsor ?? shown.sponsor
  const purpose = full?.purpose ?? shown.purpose
  const roleLine = (r: Held) => ({
    grant: r.grant,
    text: `${names[r.role] ?? capital(r.role)}, in ${r.scope}`,
    said: r.granted_by ? `given by ${r.granted_by}, ${date(r.granted_at)}` : `since ${date(r.granted_at)}`,
  })
  const chip = cx(merons.chip, 'eio-type-style-label')
  const live = full ? (agent ? full.runs.some(r => r.live) : full.sessions.length > 0) : false
  return (
    <>
      <TopBar view="gov" />
      <main className={cx(styles.page, styles.reading)}>
        <div className={styles.head}>
          <p className={cx(styles.muted, 'eio-type-style-label')}>{what}{sponsor ? ` · sponsored by ${sponsor}` : ''} · since {date(shown.since)}</p>
          <h1 className="eio-type-style-title">{shown.display_name}</h1>
          <p className={cx(styles.muted, styles.mono, 'eio-type-style-mono')}>@{shown.handle}</p>
          {full && full.state !== 'active' && (
            <div className={styles.actions}>
              <Badge>{full.state === 'invited' ? 'Waiting for a first passkey' : capital(full.state)}</Badge>
            </div>
          )}
          {purpose && <p className="eio-type-style-body">{purpose}</p>}
          {yours && (
            <p className={cx(styles.muted, 'eio-type-style-caption')}>
              This is you{full ? '' : ', as others see you; your roles show only to you and owners'}. Your passkeys, sign-ins and email are on <a href={`${at.gov}/account`}>Your account</a>.
            </p>
          )}
        </div>

        {roles && (
          <Section title="Roles" note={full ? 'Ending a role ends only this grant: the role stays in Mero.' : undefined}>
            {roles.length === 0 ? (
              <p className="eio-type-style-body">No role yet.</p>
            ) : full ? (
              <RoleLines handle={shown.handle} rows={roles.map(roleLine)} />
            ) : (
              <Card>
                {roles.map(r => {
                  const l = roleLine(r)
                  return <Line key={l.grant} text={l.text} caption={l.said} />
                })}
              </Card>
            )}
          </Section>
        )}

        {full && offered.length > 0 && (
          <Section title="Give a role" note="Owners only, with Touch ID: the role holds in that place and everything under it.">
            <GrantForm handle={shown.handle} roles={offered} />
          </Section>
        )}

        {full && !agent && (
          <Section title="Passkeys">
            {full.passkeys.length ? (
              <Card>
                {full.passkeys.map((k, i) => (
                  <Line key={i} text={k.name} caption={`added ${when(k.added_at)} · ${k.last_used_at ? `last used ${when(k.last_used_at)}` : 'not used since'}`} />
                ))}
              </Card>
            ) : (
              <p className="eio-type-style-body">No passkey yet.</p>
            )}
          </Section>
        )}

        {full && (
          <Section title={agent ? 'Runs' : 'Where they’re signed in'}>
            {agent ? (
              full.runs.length ? (
                <Card>
                  {full.runs.slice(0, 5).map(r => (
                    <Line key={r.run} text={`${r.live ? 'Running' : 'Ended'}, started ${when(r.issued_at)}`} caption={`vouched for by ${r.vouched_by}`} />
                  ))}
                </Card>
              ) : (
                <p className="eio-type-style-body">No run yet.</p>
              )
            ) : full.sessions.length ? (
              <Card>
                {full.sessions.map((x, i) => <Line key={i} text={x.device} caption={`signed in ${when(x.started_at)}`} />)}
              </Card>
            ) : (
              <p className="eio-type-style-body">Signed in nowhere.</p>
            )}
            {live && !yours && <EndSignIns handle={shown.handle} agent={agent} />}
          </Section>
        )}

        {full && (
          <div className={styles.actions}>
            <a className={chip} href={`${at.gov}/record?who=${encodeURIComponent(shown.handle)}`}>Their part of the record</a>
          </div>
        )}
      </main>
    </>
  )
}
