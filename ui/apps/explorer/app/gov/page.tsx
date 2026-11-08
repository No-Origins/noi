// Agents and roles (agreed 8 Nov): plain, in the Explorer's look, until Governance's pages are
// built in your layout. Owners add agents and grant roles here, each with a fresh touch.
import { accounts, me } from '../../lib/governance'
import { rolesIn } from '../../lib/cedar'
import { snapshot } from '../../lib/mero'
import { cx, Header, Section } from '../merons/parts'
import { AddAgentForm, GrantForm } from './Forms'
import styles from '../merons/merons.module.css'

export const metadata = { title: 'Agents and roles · Governance' }

export default async function Gov() {
  const [you, list, s] = await Promise.all([me(), accounts(), snapshot()])
  const owner = Boolean(you?.roles.some(r => r.role === 'owner'))
  const roles = rolesIn(s).map(r => ({ path: `noi.gov.roles.${r.id}`, name: r.name }))
  const all = list.ok ? list.data : []
  return (
    <article className={styles.view}>
      <Header eyebrow="Governance" title="Agents and roles" path="A plain page until your layout" />
      {!owner && <p className="eio-type-style-body">Only an owner can add agents and grant roles. You can see what you hold on your Profile.</p>}
      {owner && you && (
        <>
          <div id="agent"><Section title="Add an agent"><AddAgentForm sponsor={you.handle} /></Section></div>
          <div id="grant"><Section title="Give a role"><GrantForm handles={all.filter(a => a.state === 'active' && a.handle !== 'visitors').map(a => a.handle)} roles={roles} /></Section></div>
        </>
      )}
      <div id="accounts">
        <Section title="Accounts">
          {list.ok ? (
            <ul className={styles.checks}>
              {all.map(a => (
                <li key={a.id} className="eio-type-style-body">
                  <strong>{a.handle}</strong> · {a.display_name} · {a.kind}{a.sponsor ? `, sponsored by ${a.sponsor}` : ''} · {a.roles} role{a.roles === 1 ? '' : 's'}{a.state !== 'active' ? ` · ${a.state}` : ''}
                </li>
              ))}
            </ul>
          ) : <p className={cx(styles.muted, 'eio-type-style-body')}>{list.error}</p>}
        </Section>
      </div>
    </article>
  )
}
