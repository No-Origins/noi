import type { InputHTMLAttributes, ReactNode } from 'react'
import styles from './Toggle.module.css'

export interface ToggleProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'role' | 'size' | 'children'> {
  /** Its words: the thing that is on or off. Every toggle has them, and clicking them flips it too. */
  children: ReactNode
}

/** One thing that is on or off, and changes at once: a real checkbox told to be a switch, drawn by Eidos.
    On is lime with its thumb at the far side; locked looks locked.
    For an answer that is sent later with a form, use Checkbox. */
export function Toggle({ children, className, ...rest }: ToggleProps) {
  return (
    <label className={[styles.toggle, 'eio-type-style-body', className].filter(Boolean).join(' ')}>
      <span className={styles.track}>
        <input type="checkbox" role="switch" className={styles.input} {...rest} />
        <span className={styles.thumb} aria-hidden />
      </span>
      {children}
    </label>
  )
}
