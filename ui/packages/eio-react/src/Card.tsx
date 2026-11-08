import type { HTMLAttributes } from 'react'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** The card inset, or the tighter control inset for small cards. */
  inset?: 'default' | 'tight'
}

/** A card on the card surface, with its border and corner. */
export function Card({ inset = 'default', className, ...rest }: CardProps) {
  return <div className={[styles.card, styles[inset], className].filter(Boolean).join(' ')} {...rest} />
}
