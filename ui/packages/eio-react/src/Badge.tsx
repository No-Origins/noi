import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './Badge.module.css'

export interface BadgeProps {
  /** A status tone. Never color alone: the badge always carries its words, and danger, warning and success show an icon too. */
  tone?: 'neutral' | 'danger' | 'warning' | 'success'
  /** A meron's lifecycle state, shown as a dot before the words. */
  state?: 'active' | 'proposed' | 'deprecated'
  children: ReactNode
}

const TONE_ICON: Record<string, IconName> = { danger: 'x', warning: 'warn', success: 'check' }

/** A small pill for a state, a status or a plain fact. */
export function Badge({ tone = 'neutral', state, children }: BadgeProps) {
  const icon = TONE_ICON[tone]
  return (
    <span className={[styles.badge, styles[tone], 'eio-type-style-label'].join(' ')}>
      {state && <i className={[styles.dot, styles[state]].join(' ')} aria-hidden />}
      {icon && <Icon name={icon} size="small" />}
      {children}
    </span>
  )
}

/** A count, such as the number of proposals waiting. */
export function Count({ value, label }: { value: number; label?: string }) {
  return (
    <span className={[styles.count, 'eio-type-style-label'].join(' ')} aria-label={label ? `${value} ${label}` : undefined}>
      {value}
    </span>
  )
}
