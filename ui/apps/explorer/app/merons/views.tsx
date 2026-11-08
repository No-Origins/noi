// One view per kind of meron. Samples show each meron's own value, so their colors, fonts and
// sizes come from Mero (content), while everything around them uses Eidos roles.
import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'
import { Badge, Card } from '@noi/eio-react'
import { describeCheck, roleContrast, styleChecks, type TypeMinimums } from '../../lib/checks'
import { hex, reads, resolve } from '../../lib/color'
import { checkParams, covers, hrefOf, invariantsFor, type Index, type Meron, type Snapshot } from '../../lib/mero'
import type { TreeNode } from '../../lib/tree'
import { AllPass, CheckList, cx, Facts, MeronChip, Section } from './parts'
import { MotionSample } from './MotionSample'
import { PreviewMark } from './PreviewMark'
import { CedarWords } from './CedarWords'
import styles from './merons.module.css'

const title = (s: string) => s[0].toUpperCase() + s.slice(1)
const num = (x: number) => String(+x.toFixed(3))
const SAMPLE = 'Weekly critique for anyone shipping work'
const DEVANAGARI = 'नया समूह'

// Words for counting merons of a kind.
const PLURAL: Record<string, string> = {
  color: 'palette colors', 'color-role': 'color roles', 'font-family': 'fonts', 'font-size': 'font sizes',
  'text-style': 'text styles', space: 'spacing steps', 'space-role': 'spacing roles', size: 'sizes',
  radius: 'corners', 'border-width': 'border widths', window: 'windows', invariant: 'invariants', system: 'systems',
}
const kindOf = (m: Meron) => m.classification.subtype && m.classification.type === 'token' ? m.classification.subtype : m.classification.type

/** A small picture of a meron's value, for cards: bars for spacing, boxes for sizes and corners. */
function Mini({ idx, m }: { idx: Index; m: Meron }) {
  const sub = m.classification.subtype
  const px = sub === 'space-role' ? idx.byPath.get(m.spec.ref)?.spec.px : m.spec?.px
  if (sub === 'space' || sub === 'space-role') return <i className={styles.miniBar} style={{ width: px }} aria-hidden />
  if (sub === 'size') return <i className={styles.miniBox} style={{ width: Math.min(px, 40), height: Math.min(px, 40) }} aria-hidden />
  if (sub === 'radius') return <i className={styles.miniCorner} style={{ borderRadius: m.spec.full ? 9999 : m.spec.px }} aria-hidden />
  if (sub === 'border-width') return <i className={styles.miniLine} style={{ height: px }} aria-hidden />
  return null
}

/** Cards for the groups and merons directly inside a system or group. */
export function ChildCards({ idx, nodes, parent }: { idx: Index; nodes: TreeNode[]; parent: string }) {
  const kids = nodes.filter(n => n.parent === parent)
  return (
    <div className={styles.cards}>
      {kids.map(k => {
        const self = idx.byPath.get(k.path)
        const inside = nodes.filter(x => x.meron && x.path.startsWith(k.path + '.')).map(x => idx.byPath.get(x.path)!)
        const leaf = self && inside.length === 0
        const members = leaf ? [self] : inside
        const counts = new Map<string, number>()
        for (const x of inside) counts.set(kindOf(x), (counts.get(kindOf(x)) ?? 0) + 1)
        const summary = leaf ? self.semantics.definition : [...counts].map(([kind, c]) => `${c} ${PLURAL[kind] ?? kind}`).join(' · ')
        return (
          <Link key={k.path} href={hrefOf(k.path)} className={styles.childCard}>
            <span className={styles.childHead}>
              <span className="eio-type-style-heading">{k.name}</span>
              {k.count > 0 && <span className={cx(styles.muted, 'eio-type-style-mono')}>{k.count}</span>}
            </span>
            <span className={styles.sample}>
              {members.slice(0, 16).map(x => {
                const mini = Mini({ idx, m: x })
                const node = nodes.find(n => n.path === x.identity.path)!
                return <span key={x.identity.uid} className={styles.sampleItem}>{mini ?? <PreviewMark preview={node.preview} />}</span>
              })}
            </span>
            <span className={cx(styles.muted, 'eio-type-style-caption')}>{summary}</span>
          </Link>
        )
      })}
    </div>
  )
}

/** A meron drawn as itself, by kind. Kinds without a view show nothing here. */
export function KindView({ s, idx, nodes, m }: { s: Snapshot; idx: Index; nodes: TreeNode[]; m: Meron }) {
  if (m.classification.type === 'system') return <ChildCards idx={idx} nodes={nodes} parent={m.identity.path} />
  if (m.classification.type === 'invariant') return <InvariantView s={s} idx={idx} m={m} />
  if (m.classification.type === 'rule' && typeof m.spec?.cedar === 'string') return <CedarView s={s} m={m} />
  switch (m.classification.subtype) {
    case 'color': return <ColorView m={m} />
    case 'color-role': return <ColorRoleView s={s} idx={idx} m={m} />
    case 'font-family': return <FontFamilyView m={m} />
    case 'font-size': return <FontSizeView m={m} />
    case 'text-style': return <TextStyleView s={s} idx={idx} m={m} />
    case 'space':
    case 'space-role': return <SpaceView idx={idx} m={m} />
    case 'size': return <SizeView m={m} />
    case 'radius': return <RadiusView m={m} />
    case 'border-width': return <BorderWidthView m={m} />
    case 'window': return <WindowView m={m} />
    case 'duration': return <DurationView m={m} />
    case 'easing': return <EasingView m={m} />
    // Kinds without a view yet still show their record and spec below.
    default: return null
  }
}

// ——— Color ———

export function ColorView({ m }: { m: Meron }) {
  const [l, c, h] = m.spec.value.components
  const value = m.spec.value.hex ?? hex({ l, c, h })
  return (
    <>
      <div className={styles.colorBlock} style={{ background: value }} role="img" aria-label={`${m.identity.name}, ${value}`} />
      <Facts items={[['Hex', value], ['Lightness', num(l), 'OKLCH L'], ['Chroma', num(c), 'OKLCH C'], ['Hue', `${num(h)}°`, 'OKLCH H'], ['Family', title(m.spec.family)]]} />
    </>
  )
}

/** How a role is shown: as text, as an edge, or as a fill. */
function roleSort(m: Meron): 'text' | 'edge' | 'fill' {
  const [group, name] = m.identity.path.split('.').slice(3)
  if (group === 'text' || name?.startsWith('on-')) return 'text'
  if (group === 'border' || group === 'focus') return 'edge'
  return 'fill'
}

export function ColorRoleView({ s, idx, m }: { s: Snapshot; idx: Index; m: Meron }) {
  const inv = invariantsFor(s, m)[0]
  const minimums = checkParams(inv, 'eio.color-role')?.minimums ?? { text: 4.5, ui: 3 }
  const r = resolve(idx, m.identity.path)
  const results = roleContrast(idx, m, minimums)
  const sort = roleSort(m)
  const ground = m.spec.contrast?.[0]?.against as string | undefined
  return (
    <>
      <div className={styles.themes}>
        {(['light', 'dark'] as const).map(theme => {
          const color = r ? hex(r[theme]) : undefined
          const behind = ground ? resolve(idx, ground) : undefined
          return (
            <div key={theme} data-theme={theme} className={styles.themePanel}>
              <p className={cx(styles.muted, 'eio-type-style-label')}>{theme === 'light' ? 'Light' : 'Dark'}</p>
              {sort === 'text' && (
                <p className={cx(styles.ground, 'eio-type-style-heading')} style={{ color, background: behind ? hex(behind[theme]) : undefined }}>
                  {m.identity.name}
                </p>
              )}
              {sort === 'edge' && <span className={cx(styles.edge, m.identity.path.includes('.focus.') && styles.edgeFocus)} style={{ borderColor: color }} />}
              {sort === 'fill' && <span className={styles.fill} style={{ background: color }} />}
              <p className={cx(styles.muted, 'eio-type-style-caption')}>{reads(idx, m.spec[theme])} · {color}</p>
              {results.some(x => x.theme === theme) && (
                <div className={styles.pills}>
                  {results.filter(x => x.theme === theme).map(x => (
                    <Badge key={x.against.identity.uid} tone={x.ok ? 'success' : 'danger'}>
                      {x.against.identity.name} {x.ratio.toFixed(1)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
      {results.length > 0 && (
        <p className={cx(styles.muted, 'eio-type-style-caption')}>
          Contrast against every surface this role is read on. Text needs {minimums.text}:1; borders and focus rings {minimums.ui}:1. Mero checks it on every change.
        </p>
      )}
    </>
  )
}

// ——— Typography ———

export function FontFamilyView({ m }: { m: Meron }) {
  const f = m.spec
  const family = `'${f.family}'`
  const devanagari = f.scripts.includes('devanagari')
  const weights = f.weights as number[]
  return (
    <>
      <Card className={styles.specimen}>
        <p className="eio-type-style-display" style={{ fontFamily: family }}>Aa</p>
        <p className="eio-type-style-heading" style={{ fontFamily: family }}>{devanagari ? `${SAMPLE} · ${DEVANAGARI}` : SAMPLE}</p>
      </Card>
      <div className={styles.weights}>
        {weights.map(w => (
          <div key={w} className={styles.weight}>
            <span className="eio-type-style-title" style={{ fontFamily: family, fontWeight: w }}>Aa</span>
            <span className={cx(styles.muted, 'eio-type-style-mono')}>{w}</span>
          </div>
        ))}
      </div>
      <Facts
        items={[
          ['Weights', weights.length > 1 ? `${weights[0]}–${weights[weights.length - 1]}` : String(weights[0]), `${weights.length} weight${weights.length > 1 ? 's' : ''}`],
          ['Italic', f.italic ? 'Yes' : 'No'],
          ['Scripts', f.scripts.map(title).join(', ')],
          ['License', f.license],
          ...(f.minSize ? [['Smallest', `${f.minSize} px`, 'Only set at this size and up'] as [string, ReactNode, ReactNode]] : []),
        ]}
      />
      <p className="eio-type-style-caption">
        <a className={styles.inline} href={f.source}>{f.family} on Google Fonts</a>
        <span className={styles.muted}> · bundled offline with @noi/eio-tokens</span>
      </p>
    </>
  )
}

export function FontSizeView({ m }: { m: Meron }) {
  const px = m.spec.px as number
  return (
    <>
      <Card className={styles.specimen}>
        <p style={{ fontSize: px }}>{SAMPLE}</p>
      </Card>
      <Facts
        items={[
          ['Size', `${px} px`, `${num(px / 16)} rem`],
          ...(m.metadata.tailwind ? [['Tailwind', String(m.metadata.tailwind), 'The matching Tailwind step'] as [string, ReactNode, ReactNode]] : []),
        ]}
      />
    </>
  )
}

export function TextStyleView({ s, idx, m }: { s: Snapshot; idx: Index; m: Meron }) {
  const st = m.spec
  const font = idx.byPath.get(st.font), fallback = st.fallback ? idx.byPath.get(st.fallback) : undefined
  const px = idx.byPath.get(st.size)?.spec.px as number
  const devanagari = [font, fallback].some(f => f?.spec.scripts.includes('devanagari'))
  const added = fallback && font ? fallback.spec.scripts.filter((x: string) => !font.spec.scripts.includes(x)).map(title).join(', ') : ''
  const inv = invariantsFor(s, m)[0]
  const minimums = checkParams(inv, 'eio.text-style')?.minimums as TypeMinimums | undefined
  const checks = minimums ? styleChecks(idx, m, minimums) : []
  const sample: CSSProperties = {
    fontFamily: [font, fallback].filter(Boolean).map(f => `'${f!.spec.family}'`).join(', '),
    fontSize: px,
    lineHeight: `${st.lineHeight}px`,
    fontWeight: st.weight,
    letterSpacing: `${st.tracking}em`,
    textTransform: st.case === 'upper' ? 'uppercase' : 'none',
  }
  return (
    <>
      <Card className={styles.specimenRow}>
        <p className={styles.lineBox} style={sample}>{devanagari ? `${SAMPLE} · ${DEVANAGARI}` : SAMPLE}</p>
        <p className={cx(styles.muted, styles.aside, 'eio-type-style-caption')}>
          Line box {st.lineHeight}: {st.lineHeight} px a line, on the 4 px grid.{devanagari ? ' Devanagari marks stay inside it.' : ''}
        </p>
      </Card>
      <Facts
        items={[
          ['Font', font?.identity.name ?? st.font, fallback ? `+ ${fallback.identity.name} for ${added}` : undefined],
          ['Size', `${px} px`],
          ['Line', `${st.lineHeight} px`, `${num(st.lineHeight / px)} × size`],
          ['Weight', st.weight],
          ['Case', st.case === 'upper' ? 'Upper case' : 'As written'],
          ['Tracking', st.tracking ? `${st.tracking} em` : 'None'],
        ]}
      />
      {inv && (
        <Section title={`Checks · ${inv.identity.name}, rev ${inv.revision}`} aside={<AllPass checks={checks} />}>
          <Card><CheckList checks={checks} /></Card>
        </Section>
      )}
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        Use it with the class <code className="eio-type-style-mono">.eio-type-style-{m.identity.path.split('.').pop()}</code>.
      </p>
    </>
  )
}

// ——— Spacing, sizes and shape ———

export function SpaceView({ idx, m }: { idx: Index; m: Meron }) {
  const ref = m.classification.subtype === 'space-role' ? idx.byPath.get(m.spec.ref) : undefined
  const px = (ref ? ref.spec.px : m.spec.px) as number
  return (
    <>
      <div className={styles.stage}>
        <div className={styles.spaced} aria-hidden>
          <i className={styles.block} />
          <i className={styles.gap} style={{ width: px }} />
          <i className={styles.block} />
        </div>
      </div>
      <Facts
        items={[
          ['Size', `${px} px`, `${px / 4} × the 4 px grid`],
          ...(ref ? [['Reads', <Link key="r" href={hrefOf(ref.identity.path)} className={styles.inline}>{ref.identity.name}</Link>, 'A step on the spacing scale'] as [string, ReactNode, ReactNode]] : []),
        ]}
      />
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        CSS: <code className="eio-type-style-mono">var(--eio-{m.identity.path.split('.').slice(2).join('-')})</code>
      </p>
    </>
  )
}

export function SizeView({ m }: { m: Meron }) {
  const px = m.spec.px as number
  return (
    <>
      <div className={styles.stage}>
        {px <= 96
          ? <i className={styles.box} style={{ width: px, height: px }} aria-hidden />
          : <i className={styles.bar} style={{ width: px }} aria-hidden />}
      </div>
      <Facts items={[['Size', `${px} px`, px > 96 ? 'A width, drawn as a bar' : undefined]]} />
      <p className={cx(styles.muted, 'eio-type-style-caption')}>
        CSS: <code className="eio-type-style-mono">var(--eio-{m.identity.path.split('.').slice(2).join('-')})</code>
      </p>
    </>
  )
}

export function RadiusView({ m }: { m: Meron }) {
  return (
    <>
      <div className={styles.stage}><i className={styles.corner} style={{ borderRadius: m.spec.full ? 9999 : m.spec.px }} aria-hidden /></div>
      <Facts items={[['Corner', m.spec.full ? 'Full' : `${m.spec.px} px`, m.spec.full ? 'Round ends: a pill' : undefined]]} />
    </>
  )
}

export function BorderWidthView({ m }: { m: Meron }) {
  return (
    <>
      <div className={styles.stage}><i className={styles.rule} style={{ height: m.spec.px }} aria-hidden /></div>
      <Facts items={[['Width', `${m.spec.px} px`]]} />
    </>
  )
}

export function WindowView({ m }: { m: Meron }) {
  const panes = m.spec.panes as number
  return (
    <>
      <div className={styles.stage}>
        <div className={styles.panes}>{Array.from({ length: panes }, (_, i) => <span key={i} className={styles.pane} />)}</div>
      </div>
      <Facts items={[['From', `${m.spec.minWidth} px`, 'Window width'], ['Panes', panes, panes === 1 ? 'One pane at a time' : 'Side by side']]} />
    </>
  )
}

// ——— Motion ———

/** The CSS variable the export writes for a token: noi.eio.motion.duration.ms100 → --eio-motion-duration-ms100. */
const tokenVar = (m: Meron) => `--eio-${m.identity.path.replace(/^noi\.eio\./, '').replace(/\./g, '-')}`

export function DurationView({ m }: { m: Meron }) {
  return (
    <>
      <div className={styles.stage}>
        <MotionSample duration={tokenVar(m)} />
      </div>
      <Facts items={[['Duration', `${m.spec.ms} ms`, 'On the standard curve'], ['Reduced motion', '0 ms', 'With the system setting on, nothing moves']]} />
    </>
  )
}

export function EasingView({ m }: { m: Meron }) {
  const [x1, y1, x2, y2] = m.spec.bezier as number[]
  const P = (x: number, y: number) => `${x * 100} ${100 - y * 100}`
  return (
    <>
      <div className={styles.stage}>
        <svg className={styles.curve} viewBox="-6 -6 112 112" aria-label={`The curve from start to end: cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`}>
          <path className={styles.curveAxis} d="M0 0V100H100" />
          <path className={styles.curveHandle} d={`M${P(0, 0)}L${P(x1, y1)}M${P(1, 1)}L${P(x2, y2)}`} />
          <path className={styles.curveLine} d={`M${P(0, 0)}C${P(x1, y1)} ${P(x2, y2)} ${P(1, 1)}`} />
        </svg>
      </div>
      <Facts items={[['Curve', `cubic-bezier(${x1}, ${y1}, ${x2}, ${y2})`, 'Starts quickly, settles gently'], ['Overshoot', 'None', 'It stays between its start and its end']]} />
    </>
  )
}

// ——— Governance: roles and rules, in Cedar ———

const SYSTEM_NAME: Record<string, string> = { mero: 'Mero', governance: 'Governance' }

/** A role grants one system's actions, with blanks for who and where; a rule holds for everyone. */
export function CedarView({ s, m }: { s: Snapshot; m: Meron }) {
  const cedar = m.spec.cedar as string
  const role = m.classification.subtype === 'role'
  const forbid = /(^|\n)\s*forbid\s*\(/.test(cedar)
  const system = SYSTEM_NAME[m.spec.system] ?? m.spec.system
  const named = [...cedar.matchAll(/Action::"([^"]+)"/g)].map(x => x[1])
  const actions = named.includes(m.spec.system) ? `Every ${system} action` : named.join(', ')
  const facts: [string, ReactNode, ReactNode?][] = role
    ? [
        ['Allows', actions, `Only ${system}’s own actions: a role picks from one system`],
        ['Who and where', 'Set when granted', 'Each grant names an account and a place, such as hiddenstack in all of NOI'],
      ]
    : [['Effect', forbid ? 'Forbid' : 'Permit', forbid ? 'Forbid always wins over any permit' : 'Allows, unless a forbid says no']]
  return (
    <>
      <CedarWords s={s} m={m} />
      <Facts items={facts} />
      <pre className={cx(styles.cedar, 'eio-type-style-mono')} aria-label={`${m.identity.name} in Cedar`}>{cedar}</pre>
    </>
  )
}

// ——— Invariants ———

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const describeField = (v: any): string =>
  v.description ?? (v.enum ? `One of ${v.enum.join(', ')}` : v.type === 'boolean' ? 'Yes or no' : v.type ?? 'A value')

export function InvariantView({ s, idx, m }: { s: Snapshot; idx: Index; m: Meron }) {
  const at = m.spec.applies_to
  const schema = m.spec.schema ?? {}
  const required = new Set<string>(schema.required ?? [])
  const fields = Object.entries(schema.properties ?? {})
  const covered = s.merons.filter(x => covers(m, x))
  const checks = (m.spec.checks ?? []) as { name: string; params?: Record<string, unknown> }[]
  const kind = at?.subtype ? at.subtype.replace(/-/g, ' ') : at?.type
  return (
    <div className={styles.split}>
      <Card className={styles.rules}>
        <div className={styles.ruleHead}>
          <span className={cx(styles.muted, 'eio-type-style-label')}>Applies to</span>
          <Badge>{at?.type}{at?.subtype ? ` / ${at.subtype}` : ''}</Badge>
        </div>
        <h3 className={cx(styles.muted, 'eio-type-style-label')}>Every {kind} has</h3>
        <ul className={styles.fields}>
          {fields.map(([k, v]) => (
            <li key={k} className={styles.fieldRow}>
              <span className={styles.fieldName}>
                <code className="eio-type-style-mono">{k}</code>
                {!required.has(k) && <Badge>Optional</Badge>}
              </span>
              <span className={cx(styles.muted, 'eio-type-style-caption')}>{describeField(v)}</span>
            </li>
          ))}
        </ul>
        {checks.map(c => (
          <div key={c.name} className={styles.ruleCheck}>
            <h3 className={cx(styles.muted, 'eio-type-style-label')}>Check · {c.name}</h3>
            <ul className={styles.sentences}>{describeCheck(c).map(t => <li key={t}>{t}</li>)}</ul>
          </div>
        ))}
      </Card>
      <Card className={styles.rules}>
        <h3 className={cx(styles.muted, 'eio-type-style-label')}>Covers {covered.length}</h3>
        <ul className={styles.covered}>
          {covered.map(x => <li key={x.identity.uid}><MeronChip idx={idx} m={x} note={x.lifecycle.state === 'active' ? undefined : x.lifecycle.state} /></li>)}
        </ul>
      </Card>
    </div>
  )
}
