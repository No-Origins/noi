// One batch: each change drawn as itself, with what it changes, its test run and the decision.
// /review/<batch> shows it; /review shows the next one beside the list of batches.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Badge, Card, Disclosure } from '@noi/eio-react'
import type { Check } from '../../lib/checks'
import {
  changeName, changePath, hrefOf, index, kindLabel, review, snapshot,
  type Batch, type Index, type Meron, type Proposal, type Snapshot,
} from '../../lib/mero'
import { tree, type TreeNode } from '../../lib/tree'
import { CheckList, cx, Section } from '../merons/parts'
import { KindView } from '../merons/views'
import { Sentence } from '../merons/Sentence'
import { cedarKind, readCedar, rolesIn } from '../../lib/cedar'
import { roleSentence, ruleSentence, type RoleForm, type RuleForm } from '../../lib/sentence'
import { ApproveAll, Decide } from './Decide'
import styles from './review.module.css'

const OPERATION = { add: 'New', update: 'Change', rename: 'Rename', deprecate: 'Deprecate' } as const
const STATE = { waiting: 'Waiting', 'sent-back': 'Sent back', approved: 'Approved', rejected: 'Rejected' } as const
const ACTION: Record<string, string> = {
  'proposal.submit': 'proposed this batch',
  'proposal.revise': 'revised',
  'proposal.send-back': 'sent back',
  'proposal.approve': 'approved',
  'proposal.reject': 'rejected',
}
const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Why a change cannot be approved right now, if it cannot. */
function blocker(p: Proposal): string | undefined {
  if (p.stale) return 'Stale: Mero changed since this was proposed. The proposer needs to send it again.'
  if (!p.outcome.ok) return 'Its test run failed. Send it back with a note, or reject it.'
}

export async function BatchScreen({ batch }: { batch: string }) {
  const [s, r] = await Promise.all([snapshot(), review()])
  const b = r.batches.find(x => x.uid === batch)
  if (!b) notFound()
  // Mero with this batch's open changes in it, so each one can be drawn as it would be.
  const pending = b.proposals.filter(p => (p.state === 'waiting' || p.state === 'sent-back') && p.outcome.ok)
    .map(p => (p.outcome as { meron: Meron }).meron)
  const merged: Snapshot = {
    ...s,
    merons: [...s.merons.filter(m => !pending.some(x => x.identity.uid === m.identity.uid)), ...pending],
  }
  const idx = index(merged)
  const nodes = tree(merged, idx)
  const current = index(s)
  const waiting = b.proposals.filter(p => p.state === 'waiting')
  const blocked = waiting.map(blocker).find(Boolean)
  // Signed in, you can decide; each decision asks for your touch first (Touch ID, in Safari).
  const decides = r.writable
  return (
    <article className={styles.batch}>
      <header className={styles.batchHead}>
        <div className={styles.row}>
          <p className={cx(styles.muted, 'eio-type-style-label')}>Batch · from {b.proposer} · {when(b.created_at)}</p>
          <h1 className="eio-type-style-title">{b.title}</h1>
          <p className={cx(styles.muted, 'eio-type-style-body')}>
            {b.proposals.length} change{b.proposals.length === 1 ? '' : 's'}. Approving runs them again for real, all together: if one fails, none apply.
          </p>
        </div>
        {decides && waiting.length > 0 && (
          <ApproveAll proposals={waiting.map(p => p.uid)} blocked={blocked ? `Not yet: ${blocked}` : undefined} />
        )}
      </header>
      {b.proposals.map(p => (
        <ProposalCard key={p.uid} p={p} b={b} s={merged} idx={idx} nodes={nodes} current={current} writable={decides} />
      ))}
      <Section title="History">
        <ul className={styles.history}>
          {b.events.map(e => {
            const target = b.proposals.find(p => p.uid === e.proposal)
            return (
              <li key={e.sequence} className={styles.event}>
                <span className={cx(styles.muted, 'eio-type-style-caption')}>{when(e.occurred_at)}</span>
                <span className={styles.row}>
                  <span className="eio-type-style-body">
                    <strong>{e.actor}</strong> {ACTION[e.action] ?? e.action}
                    {target ? ` ${changeName(idx, target.change)}` : ''}
                  </span>
                  {e.note && <span className={cx(styles.quote, 'eio-type-style-body')}>{e.note}</span>}
                </span>
              </li>
            )
          })}
        </ul>
      </Section>
    </article>
  )
}

function ProposalCard({ p, b, s, idx, nodes, current, writable }: {
  p: Proposal; b: Batch; s: Snapshot; idx: Index; nodes: TreeNode[]; current: Index; writable: boolean
}) {
  const open = p.state === 'waiting' || p.state === 'sent-back'
  const after = p.outcome.ok ? p.outcome.meron : undefined
  // The record's own before, so a decided change still shows what it changed.
  const before = p.change.operation === 'add'
    ? undefined
    : (p.outcome.ok && p.outcome.before) || current.byUid.get(p.change.uid)
  return (
    <Card className={styles.proposal}>
      <div className={styles.proposalHead}>
        <Badge>{OPERATION[p.change.operation]}</Badge>
        <h2 className="eio-type-style-heading">{changeName(idx, p.change)}</h2>
        <Badge state={p.state === 'approved' ? 'active' : p.state === 'rejected' ? 'deprecated' : 'proposed'}>{STATE[p.state]}</Badge>
        {p.revision > 1 && <Badge>Rev {p.revision}</Badge>}
        {open && p.stale && <Badge tone="warning">Stale</Badge>}
      </div>
      <p className={cx(styles.muted, 'eio-type-style-mono')}>
        {changePath(idx, p.change)}
        {after && ` · ${kindLabel(after)}`}
      </p>
      <Changes p={p} before={before} s={s} />
      {open && after && (p.change.operation === 'add' || p.change.operation === 'update') && (
        <div className={styles.drawn}>
          <p className={cx(styles.muted, 'eio-type-style-label')}>As it would be</p>
          <KindView s={s} idx={idx} nodes={nodes} m={after} />
        </div>
      )}
      <Section title={`Test run · ${when(p.checked_at)}`}>
        <CheckList checks={testRun(p, current)} />
      </Section>
      {p.state === 'approved' && after && (
        <p className="eio-type-style-body">
          Approved by {p.decided_by} on {when(p.decided_at!)}. <Link className={styles.link} href={hrefOf(after.identity.path)}>See it in Merons</Link>.
        </p>
      )}
      {p.state === 'rejected' && <p className="eio-type-style-body">Rejected by {p.decided_by} on {when(p.decided_at!)}.</p>}
      {p.state === 'sent-back' && <p className={cx(styles.muted, 'eio-type-style-body')}>Waiting for {b.proposer} to revise it.</p>}
      {writable && open && <Decide proposal={p.uid} waiting={p.state === 'waiting'} blocked={blocker(p)} />}
    </Card>
  )
}

/** What the change does to the meron, field by field. */
function Changes({ p, before, s }: { p: Proposal; before?: Meron; s: Snapshot }) {
  const c = p.change
  if (c.operation === 'deprecate') return <p className="eio-type-style-body">Becomes deprecated: it stays readable, but nothing new should use it.</p>
  if (c.operation === 'rename') return <Diff rows={[['Path', before?.identity.path ?? '', c.path]]} />
  if (c.operation === 'add') return null
  const show = (v: unknown) => (typeof v === 'string' ? v : JSON.stringify(v, null, 2))
  const rows: [string, string, string][] = []
  // A role's or rule's Cedar reads as a sentence, before and after (agreed 8 Nov).
  const kind = before ? cedarKind(before) : undefined
  const words = kind && before && before.spec?.cedar !== c.meron.spec?.cedar
    ? <WordsDiff kind={kind} before={before} after={c.meron} s={s} cedar={['spec.cedar', show(before.spec?.cedar), show(c.meron.spec?.cedar) ?? '—']} />
    : undefined
  if (before) {
    if (before.identity.name !== c.meron.name) rows.push(['Name', before.identity.name, c.meron.name])
    if (before.semantics.definition !== c.meron.semantics.definition) rows.push(['Definition', before.semantics.definition, c.meron.semantics.definition])
    if (before.semantics.responsibility !== c.meron.semantics.responsibility) rows.push(['Responsibility', before.semantics.responsibility, c.meron.semantics.responsibility])
    const keys = new Set([...Object.keys(before.spec ?? {}), ...Object.keys(c.meron.spec ?? {})])
    for (const k of keys) {
      if (words && k === 'cedar') continue
      const a = show(before.spec?.[k]), z = show(c.meron.spec?.[k])
      if (a !== z) rows.push([`spec.${k}`, a ?? '—', z ?? '—'])
    }
  }
  return (
    <>
      {words}
      {rows.length ? <Diff rows={rows} /> : !words && <p className={cx(styles.muted, 'eio-type-style-body')}>No field changes.</p>}
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        Why: {c.compatibility.rationale} · {c.compatibility.impact === 'non-breaking' ? 'Nothing that reads it should break.' : `May break what reads it. Plan: ${c.compatibility.migration_plan}`}
      </p>
    </>
  )
}

/** What a role or rule says, before and after, with the change highlighted; its Cedar one click
 * away. If either side is written by hand, or Mero can't read them, the Cedar shows instead. */
async function WordsDiff({ kind, before, after, s, cedar }: {
  kind: 'role' | 'rule'; before: Meron; after: { classification: Meron['classification']; spec?: Meron['spec'] }; s: Snapshot; cedar: [string, string, string]
}) {
  const read = await readCedar([before, after])
  const plainCedar = <Diff rows={[cedar]} />
  if (!read) return plainCedar
  const [a, z] = read.readings
  if (!('form' in a) || !('form' in z)) {
    const which = !('form' in z) ? `The new ${kind} is written by hand: ${z.by_hand}.` : `The ${kind} was written by hand before.`
    return (
      <>
        <p className={cx(styles.muted, 'eio-type-style-body')}>{which} Read its Cedar.</p>
        {plainCedar}
      </>
    )
  }
  const names = { roles: Object.fromEntries(rolesIn(s).map(x => [x.id, x.name])) }
  const was = kind === 'rule' ? ruleSentence(a.form as RuleForm, names, z.form as RuleForm, 'removed') : roleSentence(a.form as RoleForm, z.form as RoleForm, 'removed')
  const now = kind === 'rule' ? ruleSentence(z.form as RuleForm, names, a.form as RuleForm, 'added') : roleSentence(z.form as RoleForm, a.form as RoleForm, 'added')
  return (
    <div className={styles.diffRow}>
      <span className={cx(styles.muted, 'eio-type-style-label')}>In words: what approving says</span>
      <div className={styles.pair}>
        <div className={styles.side}>
          <span className={cx(styles.muted, 'eio-type-style-label')}>Before</span>
          <Sentence segs={was} />
        </div>
        <div className={styles.side}>
          <span className={cx(styles.muted, 'eio-type-style-label')}>After</span>
          <Sentence segs={now} />
        </div>
      </div>
      <Disclosure summary="The Cedar, before and after">
        {plainCedar}
      </Disclosure>
    </div>
  )
}

function Diff({ rows }: { rows: [string, string, string][] }) {
  return (
    <div className={styles.diff}>
      {rows.map(([field, a, z]) => (
        <div key={field} className={styles.diffRow}>
          <span className="eio-type-style-mono">{field}</span>
          <div className={styles.pair}>
            <div className={styles.side}>
              <span className={cx(styles.muted, 'eio-type-style-label')}>Before</span>
              <pre className={cx(styles.before, 'eio-type-style-mono')}>{a}</pre>
            </div>
            <div className={styles.side}>
              <span className={cx(styles.muted, 'eio-type-style-label')}>After</span>
              <pre className="eio-type-style-mono">{z}</pre>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/** The test run in sentences: what it passed, what it checked again, or why it failed. */
function testRun(p: Proposal, idx: Index): Check[] {
  const o = p.outcome
  if (!o.ok) return [{ ok: false, text: o.error }]
  const name = (uid: string) => idx.byUid.get(uid)?.identity.name ?? 'an invariant in this batch'
  const lines: Check[] = []
  const invariants = [...new Set((o.invariants ?? []).map(i => i.uid))]
  if (invariants.length) lines.push({ ok: true, text: `Meets ${invariants.map(name).join(', ')}.` })
  // Adding a meron records its checks when proposed and again when registered; say each once.
  const checks = new Map((o.checks ?? []).map(c => [`${c.check}@${c.invariant.uid}`, c]))
  for (const c of checks.values()) lines.push({ ok: true, text: `Passes ${c.check}, from ${name(c.invariant.uid)}.` })
  const again = [...new Set((o.rechecked ?? []).map(r => r.uid))]
  if (again.length) lines.push({ ok: true, text: `${again.length} meron${again.length === 1 ? '' : 's'} that read${again.length === 1 ? 's' : ''} it still pass${again.length === 1 ? 'es' : ''}: ${again.map(name).join(', ')}.` })
  if (!lines.length) {
    const why = p.change.operation === 'rename' || p.change.operation === 'deprecate'
      ? 'Its spec stays as it is, so there was nothing to check again.'
      : 'No invariant covers it, so there was nothing to check.'
    lines.push({ ok: true, text: why })
  }
  const links = o.steps.filter(x => x === 'relationship.add').length
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
  const did = {
    add: `Adds it, files it under its system${links > 1 ? `, records ${plural(links - 1, 'meron')} it reads` : ''}, then registers and activates it.`,
    update: `Updates it${links ? ` and records ${plural(links, 'new link')}` : ''}.`,
    rename: 'Renames it. The old path still finds it.',
    deprecate: 'Moves it to deprecated.',
  }[p.change.operation]
  lines.push({ ok: null, text: `What approving does: ${did}` })
  return lines
}
