// A role or rule in words. What a change adds is highlighted; what it removes is struck through.
import type { Seg } from '../../lib/sentence'
import styles from './cedar.module.css'

export function Sentence({ segs, className }: { segs: Seg[]; className?: string }) {
  return (
    <p className={[styles.sentence, 'eio-type-style-body', className].filter(Boolean).join(' ')}>
      {segs.map((s, i) => s.mark === 'added'
        ? <mark key={i} className={styles.added}>{s.text}</mark>
        : s.mark === 'removed'
          ? <del key={i} className={styles.removed}>{s.text}</del>
          : <span key={i}>{s.text}</span>)}
    </p>
  )
}
