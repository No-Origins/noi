import type { AnchorHTMLAttributes, ReactNode } from 'react'
import { Count } from './Badge'
import styles from './Tabs.module.css'

/** A row of pill tabs, such as an app's main views. */
export function Tabs({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav className={styles.tabs} aria-label={label}>
      {children}
    </nav>
  )
}

export interface TabProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string
  /** The view on screen now: filled with the primary action color. */
  selected?: boolean
  count?: number
}

/** A real link, so it opens in a new tab and works without scripts. */
export function Tab({ selected, count, className, children, ...rest }: TabProps) {
  return (
    <a
      className={[styles.tab, selected && styles.selected, 'eio-type-style-label', className].filter(Boolean).join(' ')}
      aria-current={selected ? 'page' : undefined}
      {...rest}
    >
      {children}
      {count !== undefined && <Count value={count} />}
    </a>
  )
}
