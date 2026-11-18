// One line in a card on Governance's pages (9 Nov): an optional name above what it says, a caption
// below, and a link or button at its end. Plain, so pages and their client parts both use it.
import type { ReactNode } from 'react'
import styles from './gov.module.css'

export function Line({ name, text, caption, end }: { name?: string; text: ReactNode; caption?: ReactNode; end?: ReactNode }) {
  return (
    <div className={styles.line}>
      <div className={styles.lineText}>
        {name && <span className="eio-type-style-label">{name}</span>}
        <span className="eio-type-style-body">{text}</span>
        {caption && <span className={[styles.muted, 'eio-type-style-caption'].join(' ')}>{caption}</span>}
      </div>
      {end && <div className={styles.lineEnd}>{end}</div>}
    </div>
  )
}
