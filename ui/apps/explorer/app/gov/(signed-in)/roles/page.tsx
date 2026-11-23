// gov.no-origins.localhost:3000/roles (agreed 9 Nov, step 5; Governance's own since the build
// order's step 3, "Where Roles and Rules Live"): every role and rule in words, for everyone signed
// in. Each role: its sentence, what it may do in each system, active or set aside, and its revision.
// Governance keeps every version; each shows under its role or rule. A change is proposed here (New
// role, Change) and approved in Review by an owner, with a touch. Owners also see who holds each
// role, where and since when.
import { Button, Card, Disclosure } from '@noi/eio-react'
import { readCedar, versionText } from '../../../../lib/cedar'
import { govProposals, mayHere, rolesAndRules, rolesHeld, versionsOf, type RoleHeld, type Version } from '../../../../lib/governance'
import { plain, roleSentence, ruleSentence, systemName, verbWords, type RoleForm, type RuleForm } from '../../../../lib/sentence'
import { origins } from '../../../../lib/where'
import { Line } from '../../Line'
import { cx } from '../../../merons/parts'
import styles from '../../gov.module.css'
import merons from '../../../merons/merons.module.css'

export const metadata = { title: 'Roles · Governance' }

const ROLES = 'noi.gov.roles.'
const RULES = 'noi.gov.rules.'
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })

/** What a role may do, in words: "In Mero: read merons, propose changes." */
function mayDo(form: RoleForm, verbs: Record<string, string[]>) {
  const all = verbs[form.system] ?? []
  const these = form.pick === 'these' ? form.verbs : all.filter(v => !form.except.includes(v))
  return these.length ? `In ${systemName(form.system)}: ${these.map(verbWords).join(', ')}.` : `Nothing in ${systemName(form.system)}.`
}

/** How a version came to be, in words. */
function cameWords(v: Version) {
  const when = date(v.at)
  switch (v.came) {
    case 'approved':
      return `approved${v.approved_by ? ` by ${v.approved_by}` : ''}, ${when}`
    case 'moved':
      return `in Mero, ${v.mero?.action === 'meron.propose' ? 'proposed' : 'changed'} by ${v.mero?.by ?? 'someone'}, ${when}; moved to Governance with its history`
    case 'setup':
      return `one of the first roles and rules, ${when}`
    case 'recovery':
      return `written by the recovery command on Governance’s server, ${when}`
  }
}
const STATE: Record<Version['state'], string> = {
  proposed: 'proposed', registered: 'registered', active: 'active', deprecated: 'set aside', retired: 'retired',
}

/** Every version of one role or rule, newest first, behind a disclosure. */
function Versions({ versions }: { versions: Version[] }) {
  if (versions.length < 2) return null
  return (
    <Disclosure summary={`Every version (${versions.length})`}>
      {versions.map(v => (
        <Line
          key={v.revision}
          name={`Revision ${v.revision} · ${STATE[v.state]}`}
          text={v.name}
          caption={<>{cameWords(v)}{v.why ? <> · Why: {v.why}</> : null}</>}
        />
      ))}
    </Disclosure>
  )
}

export default async function Roles() {
  const [at, rr, held, waiting] = await Promise.all([origins(), rolesAndRules(), rolesHeld(), govProposals(false)])
  if (!rr.ok) {
    return (
      <article className={cx(merons.view, styles.reading)}>
        <div className={styles.head}>
          <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
          <h1 className="eio-type-style-title">Roles</h1>
        </div>
        <p className="eio-type-style-body">{rr.error}</p>
      </article>
    )
  }
  const live = (v: Version) => v.state === 'active' || v.state === 'deprecated'
  const roles = rr.data.roles.filter(live)
  const rules = rr.data.rules.filter(live)
  const all = [...roles, ...rules]
  // What you may propose (asked as if you touched, unrecorded: 9 Nov, step 6); each role's and
  // rule's every version; and the Cedar of each in words.
  const [may, versions, cedar] = await Promise.all([
    mayHere([{ action: 'propose', targets: [{ path: 'noi.gov.roles' }] }, ...all.map(v => ({ action: 'propose', targets: [{ path: v.path }] }))]),
    Promise.all(all.map(v => versionsOf(v.path))),
    readCedar(all.map(versionText)),
  ])
  const [mayAdd, ...mayChange] = may
  const versionsAt = (i: number) => (versions[i]?.ok ? versions[i].data : [])
  const names = Object.fromEntries(roles.map(v => [v.path.slice(ROLES.length), v.name]))
  const holders: Record<string, RoleHeld['holders']> | undefined = held.ok ? Object.fromEntries(held.data.map(r => [r.path, r.holders])) : undefined
  const waits = new Set(waiting.ok ? waiting.data.map(p => p.path) : [])
  const reading = (i: number) => cedar?.readings[i]
  const change = (v: Version, i: number) =>
    mayChange[i] && v.state === 'active'
      ? <Button href={`${at.gov}/${v.kind === 'role' ? 'roles' : 'rules'}/${v.path.slice((v.kind === 'role' ? ROLES : RULES).length)}/change`} icon="pen">Change</Button>
      : undefined
  const caption = (v: Version) =>
    `${v.state === 'deprecated' ? 'Set aside: no new grants, and those it has keep working · ' : ''}revision ${v.revision}${waits.has(v.path) ? ' · a change waits in Review' : ''}`
  return (
    <article className={cx(merons.view, styles.reading)}>
      <div className={styles.head}>
        <p className={cx(styles.muted, 'eio-type-style-label')}>Governance</p>
        <h1 className="eio-type-style-title">Roles</h1>
        <p className={cx(styles.muted, 'eio-type-style-body')}>
          What each role may do, and the rules every role is under. Governance keeps them, every version. A change is proposed here and approved in Review by an owner, with a touch; it counts from the next request, everywhere.
        </p>
        {mayAdd && (
          <div className={styles.actions}>
            <Button href={`${at.gov}/roles/new`} icon="plus">New role</Button>
          </div>
        )}
      </div>

      {roles.map((v, i) => {
        const id = v.path.slice(ROLES.length)
        const r = reading(i)
        const form = r && 'form' in r ? (r.form as RoleForm) : undefined
        const who = holders?.[v.path]
        return (
          <section key={v.path} id={id} className={styles.section}>
            <h2 className="eio-type-style-heading">{v.name}</h2>
            <Card>
              <Line text={form ? plain(roleSentence(form)) : 'Written in Cedar by hand.'} caption={caption(v)} end={change(v, i)} />
              {form && cedar && <Line name="What it may do" text={mayDo(form, cedar.verbs)} />}
              {!form && <pre className={cx(merons.cedar, 'eio-type-style-mono')}>{v.cedar}</pre>}
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
              <Versions versions={versionsAt(i)} />
            </Card>
          </section>
        )
      })}

      {rules.length > 0 && (
        <section className={styles.section}>
          <h2 className="eio-type-style-heading">The rules</h2>
          <p className={cx(styles.muted, 'eio-type-style-caption')}>Every role is under these, wherever it is given.</p>
          {rules.map((v, j) => {
            const i = roles.length + j
            const r = reading(i)
            const form = r && 'form' in r ? (r.form as RuleForm) : undefined
            return (
              <Card key={v.path}>
                <Line
                  name={v.name}
                  text={form ? plain(ruleSentence(form, { roles: names })) : 'Written in Cedar by hand.'}
                  caption={caption(v)}
                  end={change(v, i)}
                />
                {!form && <pre className={cx(merons.cedar, 'eio-type-style-mono')}>{v.cedar}</pre>}
                <Versions versions={versionsAt(i)} />
              </Card>
            )
          })}
        </section>
      )}
    </article>
  )
}
