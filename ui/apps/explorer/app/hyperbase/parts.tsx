// Pieces every page of Studio shares (15 Nov, the mock): a page's head, a section, a row, a
// meter, the words for a state. Plain components with no state of their own, so the pages and
// their client parts both use them. Made from Eidos's parts; what Eidos has no part for is drawn
// in studio.module.css.
import type { CSSProperties, ReactNode } from 'react'
import { Badge, Button, Icon, type IconName } from '@noi/eio-react'
import { PERSON } from './mock/story'
import type { ProjectState, RunState, Task } from './mock/types'
import styles from './studio.module.css'

export const cx = (...c: (string | false | undefined | null)[]) => c.filter(Boolean).join(' ')
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
export const dollars = (n: number) => `$${n.toFixed(n % 1 === 0 ? 0 : 2)}`
export const cents = (n: number) => (n >= 100 ? dollars(n / 100) : `${n}¢`)
/** How long something has waited, in words. */
export const waited = (minutes: number) => (minutes >= 120 ? `${Math.round(minutes / 60)} hours` : minutes >= 60 ? '1 hour' : minutes < 1 ? 'a moment' : plural(minutes, 'minute'))
/** Why a run is parked, said to whoever is looking: "your answer" is its person's answer. */
export const whyParked = (note: string | undefined, yours: boolean) => (note && !yours ? note.replace('your', `${PERSON}’s`) : note)

/** A page's head: Studio's name, the page's title, and the rung the page arrives with. */
export function Head({ title, rung, badges, sub, end, children }: { title: ReactNode; rung?: number; badges?: ReactNode; sub?: ReactNode; end?: ReactNode; children?: ReactNode }) {
  return (
    <header className={styles.head}>
      <p className={cx(styles.muted, 'eio-type-style-label')}>Hyperbase Studio</p>
      <div className={styles.titleRow}>
        <h1 className="eio-type-style-title">{title}</h1>
        {badges}
        {rung !== undefined && <Badge>arrives with rung {rung}</Badge>}
        {end && <span className={styles.titleEnd}>{end}</span>}
      </div>
      {sub && <p className={cx(styles.muted, 'eio-type-style-body')}>{sub}</p>}
      {children}
    </header>
  )
}

export function Section({ title, count, end, note, children }: { title: string; count?: ReactNode; end?: ReactNode; note?: ReactNode; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className="eio-type-style-heading">{title}</h2>
        {count !== undefined && <Badge>{count}</Badge>}
        {end && <div className={styles.sectionEnd}>{end}</div>}
      </div>
      {children}
      {note && <p className={cx(styles.muted, 'eio-type-style-caption')}>{note}</p>}
    </section>
  )
}

/** One row in a card: a small picture, a label, what it says, a caption, its buttons at the end,
    and whatever opens below it. */
export function Row({ icon, label, text, caption, end, below }: { icon?: IconName; label?: ReactNode; text: ReactNode; caption?: ReactNode; end?: ReactNode; below?: ReactNode }) {
  return (
    <div className={styles.row}>
      {icon && <span className={styles.rowIcon}><Icon name={icon} /></span>}
      <div className={styles.rowText}>
        {label && <span className={cx(styles.rowLabel, 'eio-type-style-label')}>{label}</span>}
        <span className="eio-type-style-body">{text}</span>
        {caption && <span className={cx(styles.muted, 'eio-type-style-caption')}>{caption}</span>}
      </div>
      {end && <div className={styles.rowEnd}>{end}</div>}
      {below && <div className={styles.rowBelow}>{below}</div>}
    </div>
  )
}

/** So many of so many, drawn as a bar with its words. Near the end of a cap it turns to a warning. */
export function Meter({ part, of, words, near }: { part: number; of: number; words: ReactNode; near?: boolean }) {
  const share = of > 0 ? Math.min(1, part / of) : 0
  return (
    <div className={cx(styles.meter, near && styles.meterNear)}>
      <span className="eio-type-style-caption">{words}</span>
      <div className={styles.meterTrack} role="img" aria-label={`${Math.round(share * 100)} in a hundred`}>
        <div className={styles.meterFill} style={{ '--part': share } as CSSProperties} />
      </div>
    </div>
  )
}

/** A label, a value, and perhaps a line under it. */
export function Fact({ label, value, note }: { label: string; value: ReactNode; note?: ReactNode }) {
  return (
    <div className={styles.fact}>
      <span className={cx(styles.muted, 'eio-type-style-label')}>{label}</span>
      <span className="eio-type-style-body">{value}</span>
      {note && <span className={cx(styles.muted, 'eio-type-style-caption')}>{note}</span>}
    </div>
  )
}

// ——— The words for a state, each with a mark. Never color alone. ———
export function ProjectBadge({ state }: { state: ProjectState }) {
  if (state === 'done') return <Badge tone="success">Done</Badge>
  if (state === 'waiting for you') return <Badge tone="warning">Waiting for you</Badge>
  const dot = state === 'working' ? 'active' : state === 'handed over' ? 'proposed' : state === 'draft' ? undefined : 'deprecated'
  return <Badge state={dot}>{state.charAt(0).toUpperCase() + state.slice(1)}</Badge>
}
export function RunBadge({ state }: { state: RunState }) {
  if (state === 'done') return <Badge tone="success">Ended: done</Badge>
  if (state === 'could not') return <Badge tone="danger">Ended: could not</Badge>
  if (state === 'at a limit') return <Badge tone="warning">Ended: at a limit</Badge>
  if (state === 'stopped') return <Badge state="deprecated">Ended: stopped</Badge>
  // A run has three words: running, parked, ended. A paused run is parked, and says why.
  return <Badge state={state === 'running' ? 'active' : 'proposed'}>{state === 'running' ? 'Running' : 'Parked'}</Badge>
}
/** Whether a run, or a computer, is marked: a run that read outside content has worked there. */
export function Marked({ marked }: { marked: boolean }) {
  return marked ? <Badge tone="warning">Marked</Badge> : <Badge>Not marked</Badge>
}

const TASK_ICON: Record<Task['state'], IconName> = { 'to do': 'dash', working: 'arrow', parked: 'minus', checking: 'eye', done: 'check', 'could not': 'x', yours: 'user' }
/** A line with a tick: a done-means line, a task of the plan, a check. */
export function Tick({ state, children }: { state: Task['state']; children: ReactNode }) {
  const tone = state === 'done' ? styles.tickDone : state === 'could not' ? styles.tickBad : state === 'to do' ? undefined : styles.tickNow
  return (
    <li className={cx(styles.tick, tone)}>
      <span className={styles.tickMark}><Icon name={TASK_ICON[state]} size="small" label={state} /></span>
      <span className={cx(styles.tickText, 'eio-type-style-body')}>{children}</span>
    </li>
  )
}

/** A control of the mock's own, such as "Show the next step": not a part of the real page. */
export function MockControl({ children, action }: { children: ReactNode; action: ReactNode }) {
  return (
    <div className={styles.mockControl}>
      <Badge tone="warning">Mock</Badge>
      <p className="eio-type-style-caption">{children}</p>
      {action}
    </div>
  )
}

/** A page for something that is not there: in the mock, what was handed over in a visit is
    forgotten when a page is loaded again. */
export function Gone({ what, back, href }: { what: string; back: string; href: string }) {
  return (
    <>
      <Head title={`No such ${what}`} sub={`The mock keeps nothing: a ${what} made in a visit is gone when a page is loaded again.`} />
      <p><Button href={href} icon="left">{back}</Button></p>
    </>
  )
}
