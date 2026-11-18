import type { ReactNode } from 'react'
import type { BadgeState, BadgeTone } from '@noi/eio-tokens/components'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './Badge.module.css'

export interface BadgeProps {
  /** A status tone. Never color alone: the badge always carries its words, and danger, warning and success show an icon too. */
  tone?: BadgeTone
  /** A meron's lifecycle state, shown as a dot before the words. */
  state?: BadgeState
  children: ReactNode
}

// Each tone and state Mero holds for Badge, and how it is drawn: a key missing here, or one Mero never
// approved, fails the type check (Component States, agreed 18 Nov).
const TONE: Record<BadgeTone, { className?: string; icon?: IconName }> = {
  neutral: {},
  danger: { className: styles.danger, icon: 'x' },
  warning: { className: styles.warning, icon: 'warn' },
  success: { className: styles.success, icon: 'check' },
}
const STATE: Record<BadgeState, string> = { active: styles.active, proposed: styles.proposed, deprecated: styles.deprecated }

/** A small pill for a state, a status or a plain fact. */
export function Badge({ tone = 'neutral', state, children }: BadgeProps) {
  const { className, icon } = TONE[tone]
  return (
    <span className={[styles.badge, className, 'eio-type-style-label'].filter(Boolean).join(' ')}>
      {state && <i className={[styles.dot, STATE[state]].join(' ')} aria-hidden />}
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
