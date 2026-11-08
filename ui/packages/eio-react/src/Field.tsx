import type { InputHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './Field.module.css'

export interface FieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** What the field is for, read by screen readers; shown only through the placeholder and icon. */
  label: string
  icon?: IconName
  /** A short keyboard hint shown at the end while the field is empty, such as "/". */
  hint?: string
  /** Shows a clear button while the field has a value. */
  onClear?: () => void
}

/** A real text input in a field frame. The frame is its label: a click anywhere on it, or just above
    or below it up to the minimum target, puts the cursor in the field; the whole frame shows the focus ring. */
export function Field({ label, icon, hint, onClear, className, value, ...rest }: FieldProps) {
  const filled = value !== undefined && value !== ''
  return (
    <label className={[styles.field, 'eio-type-style-body', className].filter(Boolean).join(' ')}>
      {icon && <Icon name={icon} />}
      <input className={styles.input} aria-label={label} value={value} {...rest} />
      {filled && onClear ? (
        <button type="button" className={styles.clear} onClick={onClear} aria-label={`Clear ${label}`}>
          <Icon name="close" size="small" />
        </button>
      ) : (
        hint && <span className={[styles.hint, 'eio-type-style-mono'].join(' ')} aria-hidden>{hint}</span>
      )}
    </label>
  )
}
