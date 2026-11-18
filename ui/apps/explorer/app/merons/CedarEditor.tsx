'use client'
// The role and rule editor (agreed 8 Nov): you pick the parts, Mero writes the Cedar, and the
// sentence says what it means. Cedar stays what is stored: the hidden "spec" field carries it to
// Review like any other change. A rule the form can't show is written by hand: owners may change
// its Cedar directly; everyone else sees it as it is.
import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Choices, Disclosure, Field, Radio, Select, TextArea } from '@noi/eio-react'
import {
  roleSentence, ruleSentence, systemName, verbWords,
  type AnyReadingForm, type Condition, type Doing, type Names, type RoleForm, type RuleForm,
} from '../../lib/sentence'
import { cedarFor } from './cedar-actions'
import { Sentence } from './Sentence'
import styles from './cedar.module.css'

export interface CedarEditorProps {
  kind: 'rule' | 'role'
  /** The form Mero read from the stored Cedar, or why it is written by hand. */
  form?: AnyReadingForm
  byHand?: string
  /** The stored Cedar, and the rest of the spec (a role's system). */
  cedar: string
  rest: Record<string, unknown>
  verbs: Record<string, string[]>
  roles: { id: string; name: string }[]
  accounts: { id: string; handle: string }[]
  places: string[]
  /** Owners may write Cedar by hand. */
  owner: boolean
  /** A new role or rule: nothing stored yet, so Mero writes its Cedar at once. */
  fresh?: boolean
  /** A new role picks its system. */
  pickSystem?: boolean
}

type Written = { ok: true; cedar: string } | { ok: false; error: string }

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(' ')

export function CedarEditor(p: CedarEditorProps) {
  const [mode, setMode] = useState<'form' | 'hand'>(p.form ? 'form' : 'hand')
  const [form, setForm] = useState<AnyReadingForm | undefined>(p.form)
  const [hand, setHand] = useState(p.cedar)
  const [written, setWritten] = useState<Written>({ ok: true, cedar: p.cedar })
  const [pending, setPending] = useState(Boolean(p.fresh))
  const seq = useRef(0)
  // The form Mero last wrote, so opening the editor, or a click that changes nothing, asks for nothing.
  const sent = useRef(p.fresh ? '' : JSON.stringify(p.form))

  // Each change to the form asks Mero for its Cedar, a moment after the last click.
  useEffect(() => {
    if (mode !== 'form' || !form || JSON.stringify(form) === sent.current) return
    sent.current = JSON.stringify(form)
    const id = ++seq.current
    setPending(true)
    const t = setTimeout(async () => {
      const r = await cedarFor(p.kind, form).catch(() => ({ ok: false as const, error: 'Mero isn’t answering.' }))
      if (id === seq.current) {
        setWritten(r)
        setPending(false)
      }
    }, 200)
    return () => clearTimeout(t)
  }, [form, mode, p.kind])

  const names: Names = {
    roles: Object.fromEntries(p.roles.map(r => [r.id, r.name])),
    accounts: Object.fromEntries(p.accounts.map(a => [a.id, a.handle])),
  }
  const cedar = mode === 'hand' ? hand : written.ok ? written.cedar : undefined
  const problem = mode === 'hand'
    ? (hand.trim() ? undefined : 'Write the Cedar, or go back to the form.')
    : pending ? 'Wait a moment: Mero is still writing the Cedar.' : written.ok ? undefined : written.error

  return (
    <div className={styles.editor}>
      <input type="hidden" name="spec" value={JSON.stringify({ ...p.rest, ...(p.kind === 'role' && form ? { system: (form as RoleForm).system } : {}), cedar: cedar ?? '' })} />
      {problem && <input type="hidden" name="spec_error" value={problem} />}
      {/* Written by hand and changed: the form asks for Touch ID first, for "write Cedar" (step 7). */}
      {mode === 'hand' && hand.trim() !== p.cedar.trim() && <input type="hidden" name="by_hand" value="1" />}
      {mode === 'form' && form && (p.kind === 'rule'
        ? <RuleParts f={form as RuleForm} set={setForm} {...p} />
        : <RoleParts f={form as RoleForm} set={setForm} verbs={p.verbs} pickSystem={p.pickSystem} />)}
      {mode === 'form' && form && (
        <div className={styles.part}>
          <span className={cx(styles.muted, 'eio-type-style-label')}>Reads as</span>
          <Sentence segs={p.kind === 'rule' ? ruleSentence(form as RuleForm, names) : roleSentence(form as RoleForm)} />
          {!pending && !written.ok && <p className={cx(styles.error, 'eio-type-style-body')} role="alert">{written.error}</p>}
          <Disclosure summary="The Cedar it writes">
            <pre className={cx(styles.code, 'eio-type-style-mono')}>{pending ? 'Writing…' : written.ok ? written.cedar : '—'}</pre>
          </Disclosure>
          {p.owner && (
            <Button className={styles.switch} onClick={() => { setHand(cedar ?? p.cedar); setMode('hand') }}>
              Write the Cedar by hand instead
            </Button>
          )}
        </div>
      )}
      {mode === 'hand' && (
        <div className={styles.part}>
          <span className={cx(styles.muted, 'eio-type-style-label')}>Written by hand</span>
          <p className={cx(styles.muted, 'eio-type-style-body')}>
            {p.byHand && !form
              ? `The form can’t show this ${p.kind}: ${p.byHand}. It shows as Cedar.`
              : `You’re writing the Cedar yourself. Review will show it as Cedar unless the form can read it.`}
          </p>
          <TextArea
            mono
            label="Cedar"
            rows={10}
            value={hand}
            readOnly={!p.owner}
            onChange={e => setHand(e.target.value)}
          />
          {!p.owner && <p className={cx(styles.muted, 'eio-type-style-body')}>Only an owner can change a {p.kind} written by hand.</p>}
          {form && (
            <Button className={styles.switch} icon="left" onClick={() => setMode('form')}>
              Back to the form
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// ——— A rule's five parts ———

function RuleParts({ f, set, verbs, roles, accounts, places }: { f: RuleForm; set: (f: RuleForm) => void } & CedarEditorProps) {
  const up = (patch: Partial<RuleForm>) => set({ ...f, ...patch })
  const whoKind = f.who === 'anyone' ? 'anyone' : 'role' in f.who ? 'role' : 'account'
  const firstRole = roles[0]?.id ?? 'owner'
  const holds = (r: string) => f.unless.some(c => typeof c !== 'string' && c.holds === r)
  const toggle = (c: Condition, on: boolean) => {
    const same = (x: Condition) => JSON.stringify(x) === JSON.stringify(c)
    up({ unless: on ? [...f.unless.filter(x => !same(x)), c] : f.unless.filter(x => !same(x)) })
  }
  return (
    <>
      <Choices className={styles.part} legend="This rule" across>
        <Radio name="cedar-effect" checked={f.effect === 'forbid'} onChange={() => up({ effect: 'forbid' })}>Forbids</Radio>
        <Radio name="cedar-effect" checked={f.effect === 'permit'} onChange={() => up({ effect: 'permit' })}>Allows</Radio>
      </Choices>
      <Choices className={styles.part} legend="Who" across>
        <Radio name="cedar-who" checked={whoKind === 'anyone'} onChange={() => up({ who: 'anyone' })}>Anyone</Radio>
        <Radio name="cedar-who" checked={whoKind === 'role'} onChange={() => up({ who: { role: firstRole } })}>Holders of a role</Radio>
        {whoKind === 'role' && (
          <Select label="Role" value={(f.who as { role: string }).role} onChange={e => up({ who: { role: e.target.value } })}>
            {withCurrent(roles.map(r => [r.id, r.name]), (f.who as { role: string }).role).map(([id, name]) => <option key={id} value={id}>{name}</option>)}
          </Select>
        )}
        <Radio name="cedar-who" checked={whoKind === 'account'} onChange={() => up({ who: { account: accounts[0]?.id ?? '' } })}>One account</Radio>
        {whoKind === 'account' && (accounts.length
          ? (
            <Select label="Account" value={(f.who as { account: string }).account} onChange={e => up({ who: { account: e.target.value } })}>
              {withCurrent(accounts.map(a => [a.id, a.handle]), (f.who as { account: string }).account).map(([id, handle]) => <option key={id} value={id}>{handle}</option>)}
            </Select>
          )
          : <Field label="Account ID" placeholder="The account’s ID" value={(f.who as { account: string }).account} onChange={e => up({ who: { account: e.target.value.trim() } })} />)}
      </Choices>
      <div className={styles.part}>
        <span className={cx(styles.muted, 'eio-type-style-label')}>Doing</span>
        {Object.entries(verbs).map(([system, list]) => (
          <SystemPick
            key={system}
            legend={systemName(system)}
            system={system}
            verbs={list}
            doing={f.doing.find(d => d.system === system)}
            allowExcept
            onChange={d => {
              const others = f.doing.filter(x => x.system !== system)
              // Keep the systems in the order they were picked.
              const at = f.doing.findIndex(x => x.system === system)
              const next = d ? (at < 0 ? [...others, d] : f.doing.map(x => (x.system === system ? d : x))) : others
              up({ doing: next })
            }}
          />
        ))}
      </div>
      <Choices className={styles.part} legend="Where" across>
        <Radio name="cedar-where" checked={f.where === 'everywhere'} onChange={() => up({ where: 'everywhere' })}>Everywhere</Radio>
        <Radio name="cedar-where" checked={f.where !== 'everywhere'} onChange={() => up({ where: { place: f.where !== 'everywhere' ? f.where.place : 'noi' } })}>In one place</Radio>
        {f.where !== 'everywhere' && (
          <>
            <Field label="Place" list="cedar-places" placeholder="noi.gov" value={f.where.place} onChange={e => up({ where: { place: e.target.value.trim() } })} />
            <datalist id="cedar-places">{places.map(pl => <option key={pl} value={pl} />)}</datalist>
          </>
        )}
      </Choices>
      <Choices className={styles.part} legend="Unless" across note="An action left out of “every … except” is an “unless” too.">
        <Checkbox checked={f.unless.includes('fresh-touch')} onChange={e => toggle('fresh-touch', e.target.checked)}>They touched just now (Touch ID)</Checkbox>
        {withCurrent(roles.map(r => [r.id, r.name]), ...f.unless.flatMap(c => (typeof c === 'string' ? [] : [c.holds]))).map(([id, name]) => (
          <Checkbox key={id} checked={holds(id)} onChange={e => toggle({ holds: id }, e.target.checked)}>They hold {name}</Checkbox>
        ))}
      </Choices>
    </>
  )
}

// ——— A role: one system, its verbs ———

function RoleParts({ f, set, verbs, pickSystem }: { f: RoleForm; set: (f: RoleForm) => void; verbs: Record<string, string[]>; pickSystem?: boolean }) {
  return (
    <>
      {pickSystem && (
        <Choices className={styles.part} legend="One system" across>
          {Object.keys(verbs).map(system => (
            <Radio key={system} name="cedar-system" checked={f.system === system} onChange={() => set({ system, pick: 'these', verbs: [] })}>{systemName(system)}</Radio>
          ))}
        </Choices>
      )}
      <div className={styles.part}>
        <SystemPick legend={`What it allows, in ${systemName(f.system)}`} system={f.system} verbs={verbs[f.system] ?? []} doing={f} allowExcept={false} required onChange={d => d && set(d)} />
        <p className={cx(styles.muted, 'eio-type-style-caption')}>Who holds it, and where, is set when it’s granted.</p>
      </div>
    </>
  )
}

/** One system's part: not about it, every action (except some), or some of them. */
function SystemPick({ legend, system, verbs, doing, allowExcept, required, onChange }: {
  legend: string; system: string; verbs: string[]; doing?: Doing; allowExcept: boolean; required?: boolean; onChange: (d: Doing | undefined) => void
}) {
  const name = systemName(system)
  const mode = !doing ? 'none' : doing.pick
  const on = (v: string) => (doing?.pick === 'these' ? doing.verbs.includes(v) : doing?.pick === 'every' ? !doing.except.includes(v) : false)
  const flip = (v: string, checked: boolean) => {
    if (!doing) return
    if (doing.pick === 'every') onChange({ system, pick: 'every', except: checked ? doing.except.filter(x => x !== v) : [...doing.except, v] })
    else onChange({ system, pick: 'these', verbs: checked ? [...doing.verbs, v] : doing.verbs.filter(x => x !== v) })
  }
  return (
    <div className={styles.system}>
      <Choices legend={legend} across>
        {!required && <Radio name={`cedar-pick-${system}`} checked={mode === 'none'} onChange={() => onChange(undefined)}>Nothing in {name}</Radio>}
        <Radio name={`cedar-pick-${system}`} checked={mode === 'every'} onChange={() => onChange({ system, pick: 'every', except: [] })}>
          Every {name} action{allowExcept ? ', except the ones you untick' : ''}, including ones added later
        </Radio>
        <Radio name={`cedar-pick-${system}`} checked={mode === 'these'} onChange={() => onChange({ system, pick: 'these', verbs: doing?.pick === 'every' ? verbs.filter(v => !doing.except.includes(v)) : [] })}>
          Only the ones you tick
        </Radio>
      </Choices>
      {mode !== 'none' && (
        <div className={styles.verbs}>
          {verbs.map(v => (
            <Checkbox key={v} tile detail={verbWords(v)} checked={on(v)} disabled={mode === 'every' && !allowExcept} onChange={e => flip(v, e.target.checked)}>
              {v}
            </Checkbox>
          ))}
        </div>
      )}
    </div>
  )
}

/** Choices, keeping any value already in the rule that is not among them. */
function withCurrent(choices: string[][], ...current: string[]): string[][] {
  const extra = current.filter(c => c && !choices.some(([id]) => id === c)).map(c => [c, c])
  return [...choices, ...extra]
}
