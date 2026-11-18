import type { InputHTMLAttributes, ReactNode } from 'react'
import type { CheckboxForm } from '@noi/eio-tokens/components'
import { Icon } from '../Icon/Icon'
import styles from '../Choice/Choice.module.css'

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'size' | 'children'> {
  /** Its words. Every checkbox has them, and clicking them ticks it too. */
  children: ReactNode
  /** A tile: the words and what it does, in a frame that tints when it is on (a role's verbs). */
  tile?: boolean
  /** What it does, under its words; for tiles. */
  detail?: ReactNode
}

// Each form Mero holds for Checkbox (Component States, agreed 18 Nov).
const FORM: Record<CheckboxForm, string> = { list: 'eio-type-style-body', tile: styles.tile }

/** A yes or no with its words: a real checkbox Eidos draws. On is lime with a tick; locked looks locked. */
export function Checkbox({ children, tile, detail, className, ...rest }: CheckboxProps) {
  return (
    <label className={[styles.choice, FORM[tile ? 'tile' : 'list'], className].filter(Boolean).join(' ')}>
      <span className={styles.box}>
        <input type="checkbox" className={styles.input} {...rest} />
        <Icon name="tick" size="small" className={styles.mark} />
      </span>
      {tile || detail ? (
        <span className={styles.words}>
          <span className={tile ? 'eio-type-style-label' : undefined}>{children}</span>
          {detail && <span className={[styles.detail, 'eio-type-style-caption'].join(' ')}>{detail}</span>}
        </span>
      ) : (
        children
      )}
    </label>
  )
}
