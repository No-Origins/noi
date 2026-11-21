// One change to roles and rules, waiting in Governance or decided there, on the one Review page
// (agreed 9 Nov, "Where Roles and Rules Live", decision 3): what it changes, in words before and
// after, why, and the decision, which Governance makes. /review/gov/<id> shows it.
import { notFound } from 'next/navigation'
import { Badge, Card, Disclosure } from '@noi/eio-react'
import { readCedar, versionText } from '../../lib/cedar'
import { govProposal, mayHere, roleNames, type GovProposal } from '../../lib/governance'
import { roleSentence, ruleSentence, type RoleForm, type RuleForm } from '../../lib/sentence'
import { cx } from '../merons/parts'
import { Sentence } from '../merons/Sentence'
import { Diff, WordsDiff } from './BatchScreen'
import { GovDecide } from './GovDecide'
import styles from './review.module.css'

const STATE = { waiting: 'Waiting', 'sent-back': 'Sent back', approved: 'Approved', rejected: 'Rejected' } as const
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** What a proposal does, in a few words: "New role", "Change", "Retire". */
export function operationWords(p: Pick<GovProposal, 'operation' | 'kind'>) {
  return { add: `New ${p.kind}`, change: 'Change', 'set-aside': 'Set aside', 'bring-back': 'Bring back', retire: 'Retire' }[p.operation]
}

/** What approving does to the role or rule, in a sentence. */
function doesWords(p: GovProposal) {
  const what = p.kind === 'role' ? 'role' : 'rule'
  switch (p.operation) {
    case 'add': return `Approving adds this ${what} at revision 1. A role does nothing until an owner gives it to someone, somewhere.`
    case 'change': return `Approving writes revision ${(p.base_revision ?? 0) + 1}; every earlier one is kept.`
    case 'set-aside': return p.kind === 'role'
      ? 'Approving sets it aside: it gets no new grants, and those it has keep working.'
      : 'Approving sets it aside; a rule set aside still holds.'
    case 'bring-back': return 'Approving brings it back, after checking it against today’s checks.'
    case 'retire': return p.kind === 'role'
      ? 'Approving retires it for good: every grant of it ends.'
      : 'Approving retires it for good: it no longer holds.'
  }
}

export async function GovProposalScreen({ id }: { id: string }) {
  const r = await govProposal(id)
  if (!r.ok) {
    if (r.error.includes('no proposal')) notFound()
    return <p className="eio-type-style-body">{r.error}</p>
  }
  const p = r.data
  const [[may], names] = await Promise.all([
    p.state === 'waiting' ? mayHere([{ action: 'review', targets: [{ path: p.path }] }]) : Promise.resolve([false]),
    roleNames(),
  ])
  const kind = p.kind
  const after = versionText(p)
  const cedarRows: [string, string, string] = ['Cedar', p.before?.cedar ?? '', p.cedar]
  const rows: [string, string, string][] = []
  if (p.before && p.operation === 'change') {
    if (p.before.name !== p.name) rows.push(['Name', p.before.name, p.name])
    if (p.before.definition !== p.definition) rows.push(['Definition', p.before.definition, p.definition])
    if (p.before.responsibility !== p.responsibility) rows.push(['Responsibility', p.before.responsibility, p.responsibility])
  }
  // A new role or rule reads as one sentence; a change, before and after.
  let alone: React.ReactNode = null
  if (!p.before || p.operation !== 'change') {
    const read = await readCedar([after])
    const reading = read?.readings[0]
    alone = reading && 'form' in reading
      ? <Sentence segs={kind === 'rule' ? ruleSentence(reading.form as RuleForm, { roles: Object.fromEntries(names.map(x => [x.id, x.name])) }) : roleSentence(reading.form as RoleForm)} />
      : <p className={cx(styles.muted, 'eio-type-style-body')}>Written in Cedar by hand{reading && 'by_hand' in reading ? `: ${reading.by_hand}` : ''}.</p>
  }
  const blocked = p.stale ? 'Stale: it changed since this was proposed. Send it back with a note, or reject it.' : undefined
  return (
    <article className={styles.batch}>
      <header className={styles.batchHead}>
        <div className={styles.row}>
          <p className={cx(styles.muted, 'eio-type-style-label')}>In Governance · from {p.proposed_by} · {when(p.proposed_at)}</p>
          <h1 className="eio-type-style-title">{operationWords(p)}: {p.name}</h1>
          <p className={cx(styles.muted, 'eio-type-style-body')}>
            Roles and rules live in Governance, so Governance decides this change: an owner, with a touch. {doesWords(p)}
          </p>
        </div>
        {!may && p.state === 'waiting' && (
          <p className={cx(styles.muted, 'eio-type-style-caption')}>
            You may read this change. Deciding it needs a role that may approve in noi.gov: an owner.
          </p>
        )}
      </header>
      <Card className={styles.proposal}>
        <div className={styles.proposalHead}>
          <Badge>{operationWords(p)}</Badge>
          <h2 className="eio-type-style-heading">{p.name}</h2>
          <Badge state={p.state === 'approved' ? 'active' : p.state === 'rejected' ? 'deprecated' : 'proposed'}>{STATE[p.state]}</Badge>
          {p.base_revision && <Badge>From revision {p.base_revision}</Badge>}
          {p.stale && p.state === 'waiting' && <Badge tone="warning">Stale</Badge>}
          {p.by_hand && <Badge>Cedar written by hand</Badge>}
        </div>
        <p className={cx(styles.muted, 'eio-type-style-mono')}>{p.path} · {kind}</p>
        {p.operation === 'change' && p.before
          ? (
            <>
              {p.before.cedar !== p.cedar && <WordsDiff kind={kind} before={versionText(p.before)} after={after} cedar={cedarRows} />}
              {rows.length > 0 && <Diff rows={rows} />}
            </>
          )
          : (
            <div className={styles.diffRow}>
              <span className={cx(styles.muted, 'eio-type-style-label')}>In words</span>
              {alone}
              <Disclosure summary="Its Cedar">
                <pre className="eio-type-style-mono">{p.cedar}</pre>
              </Disclosure>
            </div>
          )}
        {p.operation === 'add' && (
          <p className={cx(styles.muted, 'eio-type-style-body')}>{p.definition} {p.responsibility}</p>
        )}
        <p className={cx(styles.muted, 'eio-type-style-caption')}>Why: {p.why}</p>
        {p.state === 'approved' && <p className="eio-type-style-body">Approved by {p.decided_by} on {when(p.decided_at!)}.</p>}
        {p.state === 'rejected' && <p className="eio-type-style-body">Rejected by {p.decided_by} on {when(p.decided_at!)}: {p.note}</p>}
        {p.state === 'sent-back' && <p className="eio-type-style-body">Sent back by {p.decided_by} on {when(p.decided_at!)}: {p.note} {p.proposed_by} may propose it again.</p>}
        {may && <GovDecide proposal={p.id} path={p.path} blocked={blocked} />}
      </Card>
    </article>
  )
}
