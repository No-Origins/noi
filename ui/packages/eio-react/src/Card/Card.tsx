import type { HTMLAttributes } from 'react'
import type { CardInset } from '@noi/eio-tokens/components'
import styles from './Card.module.css'

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** The card inset, or the tighter control inset for small cards. */
  inset?: CardInset
}

// Each inset Mero holds for Card (Component States, agreed 18 Nov).
const INSET: Record<CardInset, string> = { default: styles.default, tight: styles.tight }

/** A card on the card surface, with its border and corner. */
export function Card({ inset = 'default', className, ...rest }: CardProps) {
  return <div className={[styles.card, INSET[inset], className].filter(Boolean).join(' ')} {...rest} />
}
