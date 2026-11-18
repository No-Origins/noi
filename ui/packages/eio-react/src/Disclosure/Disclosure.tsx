import type { DetailsHTMLAttributes, ReactNode } from 'react'
import { Icon } from '../Icon/Icon'
import styles from './Disclosure.module.css'

export interface DisclosureProps extends DetailsHTMLAttributes<HTMLDetailsElement> {
  /** The words that open it. */
  summary: ReactNode
  /** What it hides, shown below once it is open. */
  children: ReactNode
}

/** A fold-open section: a real details element, with an arrow that turns and a label. */
export function Disclosure({ summary, className, children, ...rest }: DisclosureProps) {
  return (
    <details className={[styles.fold, className].filter(Boolean).join(' ')} {...rest}>
      <summary className={[styles.summary, 'eio-type-style-label'].join(' ')}>
        <Icon name="right" size="small" className={styles.arrow} />
        {summary}
      </summary>
      <div className={styles.body}>{children}</div>
    </details>
  )
}
