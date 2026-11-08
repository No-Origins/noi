import type { ReactNode, SelectHTMLAttributes } from 'react'
import { Icon } from './Icon'
import styles from './Select.module.css'

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size' | 'multiple'> {
  /** What it picks, read by screen readers, when no visible label around it says so. */
  label?: string
  /** Fill the width of the container; otherwise it fits its words. */
  wide?: boolean
  /** Its options. */
  children: ReactNode
}

/** Pick one from a list: a real select in Field's frame, with a down arrow. The list it opens is the
    system's own. */
export function Select({ label, wide, className, children, ...rest }: SelectProps) {
  return (
    <span className={[styles.select, wide && styles.wide, 'eio-type-style-body', className].filter(Boolean).join(' ')}>
      <select className={styles.control} aria-label={label} {...rest}>
        {children}
      </select>
      <Icon name="down" size="small" className={styles.arrow} />
    </span>
  )
}
