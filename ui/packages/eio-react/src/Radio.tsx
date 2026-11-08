import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './Choice.module.css'

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'children'> {
  /** Its words. Every radio has them, and clicking them chooses it too. */
  children: ReactNode
  /** Radios that share a name are one question: arrow keys move between them. */
  name: string
}

/** One of several, with its words: a real radio Eidos draws, a lime circle with a dark dot when chosen.
    Put radios in Choices, so their question is said with them. */
export function Radio({ children, className, ...rest }: RadioProps) {
  return (
    <label className={[styles.choice, 'eio-type-style-body', className].filter(Boolean).join(' ')}>
      <span className={[styles.box, styles.round].join(' ')}>
        <input type="radio" className={styles.input} {...rest} />
        <span className={[styles.mark, styles.dot].join(' ')} aria-hidden />
      </span>
      {children}
    </label>
  )
}
