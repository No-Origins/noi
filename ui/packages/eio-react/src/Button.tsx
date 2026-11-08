import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import styles from './Button.module.css'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Primary for the one main action, secondary for the other strong one, plain for the rest. */
  variant?: 'primary' | 'secondary' | 'plain'
  /** 40 px, or 48 px for a screen's single big action. */
  size?: 'default' | 'large'
  icon?: IconName
  /** Fill the width of the container. */
  wide?: boolean
}

/** A real button: keyboards and screen readers work, it shows the focus ring and has a 44 px touch target. */
export function Button({ variant = 'plain', size = 'default', icon, wide, className, children, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={[styles.button, styles[variant], styles[size], wide && styles.wide, 'eio-type-style-label', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {icon && <Icon name={icon} size="small" />}
      {children}
    </button>
  )
}
