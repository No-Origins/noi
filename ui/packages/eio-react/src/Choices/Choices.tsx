import type { FieldsetHTMLAttributes, ReactNode } from 'react'
import type { ChoicesLayout } from '@noi/eio-tokens/components'
import styles from './Choices.module.css'

export interface ChoicesProps extends FieldsetHTMLAttributes<HTMLFieldSetElement> {
  /** The question, said by screen readers with every choice in it. */
  legend: ReactNode
  /** Choices in a row that wraps, instead of one under another. */
  across?: boolean
  /** A line under the choices, in caption words. */
  note?: ReactNode
  /** Radios, checkboxes, and any Select or Field that goes with one of them. */
  children: ReactNode
}

// Each layout Mero holds for Choices (Component States, agreed 18 Nov).
const LAYOUT: Record<ChoicesLayout, string | undefined> = { down: undefined, across: styles.across }

/** A question and its choices: a real fieldset and legend, down or across. */
export function Choices({ legend, across, note, className, children, ...rest }: ChoicesProps) {
  return (
    <fieldset className={[styles.choices, LAYOUT[across ? 'across' : 'down'], className].filter(Boolean).join(' ')} {...rest}>
      <legend className={[styles.legend, 'eio-type-style-label'].join(' ')}>{legend}</legend>
      <div className={styles.options}>{children}</div>
      {note && <p className={[styles.note, 'eio-type-style-caption'].join(' ')}>{note}</p>}
    </fieldset>
  )
}
