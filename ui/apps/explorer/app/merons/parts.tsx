// Pieces every meron page shares: the header, facts, checks, links to other merons, connections
// and the record. Server components; they read one snapshot and render it.
import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge, Chip, Disclosure, Icon } from '@noi/eio-react'
import type { Check } from '../../lib/checks'
import { hrefOf, invariantsFor, type Index, type Meron, type Snapshot } from '../../lib/mero'
import { preview } from '../../lib/tree'
import { PreviewMark } from './PreviewMark'
import styles from './merons.module.css'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')

const BADGE_STATE = { active: 'active', proposed: 'proposed', deprecated: 'deprecated' } as const
const capital = (s: string) => s[0].toUpperCase() + s.slice(1)

export function Header({ eyebrow, title, path, m, action }: { eyebrow: string; title: string; path: string; m?: Meron; action?: ReactNode }) {
  const parts = path.split('.')
  const state = m?.lifecycle.state
  return (
    <header className={styles.header}>
      <p className={cx(styles.muted, 'eio-type-style-label')}>{eyebrow}</p>
      <div className={styles.titleRow}>
        <h1 className="eio-type-style-title">{title}</h1>
        {m && <Badge state={state && state in BADGE_STATE ? BADGE_STATE[state as keyof typeof BADGE_STATE] : undefined}>{capital(m.lifecycle.state)}</Badge>}
        {m && <Badge>Rev {m.revision}</Badge>}
        {action && <span className={styles.titleAction}>{action}</span>}
      </div>
      <nav aria-label="Path" className={cx(styles.crumbs, 'eio-type-style-mono')}>
        {parts.map((seg, i) => {
          const p = parts.slice(0, i + 1).join('.')
          return (
            <span key={p}>
              {i > 0 && '.'}
              {i < parts.length - 1 ? <Link href={hrefOf(p)}>{seg}</Link> : <span aria-current="page">{seg}</span>}
            </span>
          )
        })}
      </nav>
    </header>
  )
}

export function Section({ title, aside, children }: { title: string; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={cx(styles.muted, 'eio-type-style-label')}>{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

/** Small cards of facts: a label, a value, and an optional note. */
export function Facts({ items, small }: { items: [string, ReactNode, ReactNode?][]; small?: boolean }) {
  return (
    <dl className={cx(styles.facts, small && styles.small)}>
      {items.map(([label, value, note]) => (
        <div key={label} className={styles.fact}>
          <dt className={cx(styles.muted, 'eio-type-style-label')}>{label}</dt>
          <dd className="eio-type-style-heading">{value}</dd>
          {note && <dd className={cx(styles.muted, 'eio-type-style-caption')}>{note}</dd>}
        </div>
      ))}
    </dl>
  )
}

/** Check lines. Never color alone: each line has its own icon and words. */
export function CheckList({ checks }: { checks: Check[] }) {
  return (
    <ul className={styles.checks}>
      {checks.map((c, i) => (
        <li key={i} className={cx(styles.check, c.ok === false && styles.fail, c.ok === null && styles.na)}>
          <span className={styles.mark}>
            <Icon name={c.ok === null ? 'dash' : c.ok ? 'check' : 'x'} label={c.ok === null ? 'Does not apply' : c.ok ? 'Passes' : 'Fails'} />
          </span>
          <span>{c.text}</span>
        </li>
      ))}
    </ul>
  )
}

export function AllPass({ checks }: { checks: Check[] }) {
  const failing = checks.filter(c => c.ok === false).length
  return failing ? <Badge tone="danger">{failing} failing</Badge> : <Badge tone="success">All pass</Badge>
}

/** A link to another meron, with its mark. */
export function MeronChip({ idx, m, note }: { idx: Index; m: Meron; note?: string }) {
  return (
    <Chip href={hrefOf(m.identity.path)} mark={<PreviewMark preview={preview(idx, m)} />} note={note}>
      {m.identity.name}
    </Chip>
  )
}

/** Which themes of a role read a palette color: "light", "dark" or "both". */
function themesUsing(role: Meron, color: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uses = (v: any) => v.ref === color || v.mix?.color === color || v.mix?.over === color
  const light = uses(role.spec.light), dark = uses(role.spec.dark)
  return light && dark ? 'both themes' : light ? 'light' : dark ? 'dark' : undefined
}

/** How a meron connects to the rest of Mero. */
export function Connections({ s, idx, m }: { s: Snapshot; idx: Index; m: Meron }) {
  const isColor = m.classification.subtype === 'color' || m.classification.subtype === 'color-role'
  const rows: [string, Meron[], ((x: Meron) => string | undefined)?][] = [
    ['Inside', idx.to(m, 'contains')],
    ['Reads', idx.from(m, 'depends-on')],
    ['Read by', idx.to(m, 'depends-on'), isColor ? x => x.classification.subtype === 'color-role' ? themesUsing(x, m.identity.path) : undefined : undefined],
    ['Checked by', invariantsFor(s, m)],
    ['Governed by', idx.from(m, 'governed-by')],
    ['Governs', idx.to(m, 'governed-by')],
    // A system's contents are its groups, shown above.
    ['Contains', m.classification.type === 'system' ? [] : idx.from(m, 'contains')],
  ]
  const shown = rows.filter(([, list]) => list.length > 0)
  if (!shown.length) return null
  return (
    <Section title="Connections">
      <dl className={styles.connections}>
        {shown.map(([label, list, note]) => (
          <div key={label} className={styles.connRow}>
            <dt className={cx(styles.muted, 'eio-type-style-label')}>{label}</dt>
            <dd className={styles.chips}>
              {list.map(x => <MeronChip key={x.identity.uid} idx={idx} m={x} note={note?.(x)} />)}
            </dd>
          </div>
        ))}
      </dl>
    </Section>
  )
}

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

/** The meron's record in Mero: lifecycle, scope, dates, and its spec as stored. */
export function Record({ idx, m }: { idx: Index; m: Meron }) {
  const scope = idx.byUid.get(m.authority_scope)
  return (
    <Section title="Record">
      <Facts
        small
        items={[
          ['State', capital(m.lifecycle.state), `Release ${m.lifecycle.release_mode}`],
          ['Scope', scope ? <Link href={hrefOf(scope.identity.path)} className={styles.inline}>{scope.identity.name}</Link> : m.authority_scope, 'Who may change it'],
          ['Created', when(m.created_at)],
          ['Updated', when(m.updated_at), `Revision ${m.revision}`],
        ]}
      />
      <p className={cx(styles.muted, 'eio-type-style-mono')}>uid {m.identity.uid}</p>
      <Disclosure summary="Spec and metadata as stored">
        <pre className={cx(styles.json, 'eio-type-style-mono')}>{JSON.stringify({ spec: m.spec, metadata: m.metadata }, null, 2)}</pre>
      </Disclosure>
    </Section>
  )
}
