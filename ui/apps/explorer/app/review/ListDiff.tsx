// A changed list in a meron's spec, told by what was added, taken away and changed (18 Nov 2026),
// instead of the whole list twice. Each line has its icon and its word, never colour alone.
import { Icon } from '@noi/eio-react'
import { keyOf, listSummary, type ListChange } from '../../lib/lists'
import type { Index } from '../../lib/mero'
import { cx } from '../merons/parts'
import styles from './review.module.css'

// The lists a component's meron holds, named as its page names them.
const LABEL: Record<string, string> = {
  states: 'States it shows',
  reads: 'Eidos values it reads',
  uses: 'Components it uses',
  files: 'Its files',
}

const short = (sha: unknown) => (typeof sha === 'string' ? `${sha.slice(0, 12)}…` : '')

export function ListDiff({ field, before, after, change, idx }: {
  field: string; before: unknown[]; after: unknown[]; change: ListChange; idx: Index
}) {
  const find = (list: unknown[], key: string) => list.find(v => keyOf(v) === key)
  // A path to a meron reads as its name, with the path after it.
  const words = (key: string, list: unknown[]) => {
    const item = find(list, key)
    const m = idx.byPath.get(key)
    if (m) return `${m.identity.name} · ${key}`
    if (item && typeof item === 'object' && 'words' in item) return `${key}: ${(item as { words: unknown }).words}`
    if (item && typeof item === 'object' && 'sha256' in item) return `${key} · fingerprint ${short((item as { sha256: unknown }).sha256)}`
    return key
  }
  const line = (icon: 'plus' | 'minus' | 'pen', label: string, text: string, gone = false) => (
    <li key={`${label}-${text}`} className={styles.listLine}>
      <Icon name={icon} size="small" label={label} />
      <span className={cx('eio-type-style-body', gone && styles.before)}>{text}</span>
    </li>
  )
  return (
    <div className={styles.diffRow}>
      <span className={styles.listHead}>
        <span className="eio-type-style-label">{LABEL[field] ?? field}</span>
        <span className={cx(styles.muted, 'eio-type-style-mono')}>spec.{field}</span>
      </span>
      <span className={cx(styles.muted, 'eio-type-style-caption')}>{listSummary(change)}</span>
      <ul className={styles.listDiff}>
        {change.added.map(k => line('plus', 'Added', words(k, after)))}
        {change.removed.map(k => line('minus', 'Taken away', words(k, before), true))}
        {change.changed.map(k => {
          const a = find(before, k) as { sha256?: unknown; words?: unknown } | undefined
          const z = find(after, k) as { sha256?: unknown; words?: unknown } | undefined
          const text = a?.sha256 !== undefined && z?.sha256 !== undefined
            ? `${k} · its fingerprint changes, ${short(a.sha256)} to ${short(z.sha256)}`
            : a?.words !== undefined && z?.words !== undefined
              ? `${k} · reworded, “${a.words}” to “${z.words}”`
              : `${k} · changed`
          return line('pen', a?.words !== undefined ? 'Reworded' : 'Changed', text)
        })}
      </ul>
    </div>
  )
}
