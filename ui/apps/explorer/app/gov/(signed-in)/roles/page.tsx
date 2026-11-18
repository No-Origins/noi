// gov.no-origins.localhost:3000/roles (agreed 9 Nov, step 5): every role and rule in words, for
// everyone signed in. Each role: its sentence, what it may do in each system, active or set aside,
// and its revision in Mero, where it is changed and approved in Review. Owners also see who holds
// each, where and since when. The roles and rules come from Mero, read as Mero lets you; who holds
// them comes from Governance, which shows it to owners only.
import { Card } from '@noi/eio-react'
import { readCedar } from '../../../../lib/cedar'
import { rolesHeld, type RoleHeld } from '../../../../lib/governance'
import { govSnapshot, hrefOf, type Meron } from '../../../../lib/mero'
import { plain, roleSentence, ruleSentence, systemName, verbWords, type RoleForm, type RuleForm } from '../../../../lib/sentence'
import { origins } from '../../../../lib/where'
import { Line } from '../../Line'
import { cx } from '../../../merons/parts'
import styles from '../../gov.module.css'
import merons from '../../../merons/merons.module.css'

export const metadata = { title: 'Roles · Governance' }

const ROLES = 'noi.gov.roles.'
const RULES = 'noi.gov.rules.'
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** What a role may do, in words: "In Mero: read merons, propose changes." */
function mayDo(form: RoleForm, verbs: Record<string, string[]>) {
  const all = verbs[form.system] ?? []
  const these = form.pick === 'these' ? form.verbs : all.filter(v => !form.except.includes(v))
  return these.length ? `In ${systemName(form.system)}: ${these.map(verbWords).join(', ')}.` : `Nothing in ${systemName(form.system)}.`
}

export default async function Roles() {
  const [at, s, held] = await Promise.all([origins(), govSnapshot(), rolesHeld()])
  const live = (m: Meron) => m.lifecycle.state === 'active' || m.lifecycle.state === 'deprecated'
  const byPath = (a: Meron, b: Meron) => a.identity.path.localeCompare(b.identity.path)
  const roles = s.merons.filter(m => m.identity.path.startsWith(ROLES) && live(m)).sort(byPath)
  const rules = s.merons.filter(m => m.identity.path.startsWith(RULES) && live(m)).sort(byPath)
  const cedar = await readCedar([...roles, ...rules])
  const names = Object.fromEntries(roles.map(m => [m.identity.path.slice(ROLES.length), m.identity.name]))
  const holders: Record<string, RoleHeld['holders']> | undefined = held.ok ? Object.fromEntries(held.data.map(r => [r.path, r.holders])) : undefined
  const chip = cx(merons.chip, 'eio-type-style-label')
  const reading = (i: number) => cedar?.readings[i]
  return (
    <article className={cx(merons.view, styles.reading)}>
      <div className={styles.head}>
        <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
        <h1 className="eio-type-style-title">Roles</h1>
        <p className={cx(styles.muted, 'eio-type-style-body')}>
          What each role may do, and the rules every role is under. Roles and rules are merons in Mero: each change to one is approved in Review, and Governance enforces its own copy.
        </p>
        {holders && (
          <div className={styles.actions}>
            <a className={chip} href={`${at.mero}/merons/noi/gov/roles?new`}>New role</a>
          </div>
        )}
      </div>

      {roles.map((m, i) => {
        const id = m.identity.path.slice(ROLES.length)
        const r = reading(i)
        const form = r && 'form' in r ? (r.form as RoleForm) : undefined
        const who = holders?.[m.identity.path]
        return (
          <section key={m.identity.path} id={id} className={styles.section}>
            <h2 className="eio-type-style-heading">{m.identity.name}</h2>
            <Card>
              <Line
                text={form ? plain(roleSentence(form)) : 'Written in Cedar by hand: see it in Mero.'}
                caption={`${m.lifecycle.state === 'deprecated' ? 'Set aside: no new grants, and those it has keep working · ' : ''}revision ${m.revision}`}
                end={<a className={chip} href={`${at.mero}${hrefOf(m.identity.path)}?change`}>Change in Mero</a>}
              />
              {form && cedar && <Line name="What it may do" text={mayDo(form, cedar.verbs)} />}
              {who && (
                <Line
                  name="Who holds it"
                  text={who.length ? (
                    <>
                      {who.map((h, j) => (
                        <span key={`${h.handle}-${h.scope}`}>
                          {j > 0 && ', '}
                          <a href={`${at.base}/@${h.handle}`}>{h.handle}</a> in {h.scope}, since {date(h.granted_at)}
                        </span>
                      ))}
                    </>
                  ) : 'No one.'}
                />
              )}
            </Card>
          </section>
        )
      })}

      {rules.length > 0 && (
        <section className={styles.section}>
          <h2 className="eio-type-style-heading">The rules</h2>
          <p className={cx(styles.muted, 'eio-type-style-caption')}>Every role is under these, wherever it is given.</p>
          <Card>
            {rules.map((m, j) => {
              const r = reading(roles.length + j)
              const form = r && 'form' in r ? (r.form as RuleForm) : undefined
              return (
                <Line
                  key={m.identity.path}
                  name={m.identity.name}
                  text={form ? plain(ruleSentence(form, { roles: names })) : 'Written in Cedar by hand: see it in Mero.'}
                  caption={`revision ${m.revision}`}
                  end={<a className={chip} href={`${at.mero}${hrefOf(m.identity.path)}`}>See in Mero</a>}
                />
              )
            })}
          </Card>
        </section>
      )}
    </article>
  )
}
