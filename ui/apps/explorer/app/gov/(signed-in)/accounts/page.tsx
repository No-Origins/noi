// gov.no-origins.localhost:3000/accounts (agreed 9 Nov): everyone who can act in NOI, for owners,
// each linking to their profile, where an owner gives them a role. Adding an agent happens here.
// Each row names the roles held and where, and when they last signed in (agreed 9 Nov, step 5).
import { Disclosure } from '@noi/eio-react'
import { when } from '../../../../lib/changes'
import { accounts, me, type Account } from '../../../../lib/governance'
import { origins } from '../../../../lib/where'
import { cx, Header, Section } from '../../../merons/parts'
import { AddAgentForm } from '../../Forms'
import styles from '../../../merons/merons.module.css'

export const metadata = { title: 'Accounts · Governance' }

const GROUPS: [string, string][] = [['person', 'People'], ['agent', 'Agents'], ['visitors', 'Signed out']]
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

/** The roles held and where: "Owner and Maintainer in noi, Proposer in noi.eio". */
function heldWords(a: Account) {
  if (!a.held.length) return 'no role'
  const places = new Map<string, string[]>()
  for (const g of a.held) places.set(g.scope, [...(places.get(g.scope) ?? []), capital(g.role)])
  return [...places].map(([scope, roles]) => `${roles.join(' and ')} in ${scope}`).join(', ')
}

/** When they last signed in; an agent, its last run. */
function lastWords(a: Account) {
  if (a.kind === 'visitors') return ''
  if (!a.last_signed_in) return a.kind === 'agent' ? ' · no run yet' : ' · never signed in'
  return ` · ${a.kind === 'agent' ? 'last run' : 'last signed in'} ${when(a.last_signed_in)}`
}

export default async function Accounts() {
  const [you, list, at] = await Promise.all([me(), accounts(), origins()])
  const owner = Boolean(you?.roles.some(r => r.role === 'owner'))
  const line = (a: Account) => (
    <li key={a.id} className="eio-type-style-body">
      <a href={`${at.base}/@${a.handle}`}><strong>{a.display_name}</strong></a>{' '}
      <span className={cx(styles.muted, 'eio-type-style-mono')}>@{a.handle}</span>
      {' · '}{heldWords(a)}
      {a.sponsor ? ` · sponsored by ${a.sponsor}` : ''}
      {lastWords(a)}
      {a.state === 'invited' ? ' · waiting for a first passkey' : a.state !== 'active' ? ` · ${a.state}` : ''}
    </li>
  )
  return (
    <article className={styles.view}>
      <Header eyebrow="Governance" title="Accounts" path="Everyone who can act in NOI" />
      {!list.ok ? (
        <p className={cx(styles.muted, 'eio-type-style-body')}>{list.error}. Only owners see every account.</p>
      ) : (
        GROUPS.map(([kind, title]) => {
          const these = list.data.filter(a => a.kind === kind)
          return these.length ? (
            <Section key={kind} title={title}>
              <ul className={styles.checks}>{these.map(line)}</ul>
            </Section>
          ) : null
        })
      )}
      {owner && you && (
        <Disclosure summary="Add an agent">
          <AddAgentForm sponsor={you.handle} />
        </Disclosure>
      )}
    </article>
  )
}
