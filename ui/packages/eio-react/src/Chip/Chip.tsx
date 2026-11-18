import type { AnchorHTMLAttributes, ReactNode } from 'react'
import type { ChipLink } from '@noi/eio-tokens/components'
import { Icon } from '../Icon/Icon'
import { insideNoOrigins } from '../links/links'
import styles from './Chip.module.css'

export interface ChipProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  /** Where the thing is. */
  href: string
  /** Its small picture, given by the page: a colour, a text sample or an icon. */
  mark?: ReactNode
  /** Its name. Every chip has one. */
  children: ReactNode
  /** A few words after the name, such as its state. */
  note?: ReactNode
}

// Where it leads, and how that is drawn (Component States, agreed 18 Nov): a thing in No Origins opens
// here; another site's address keeps the sign every outside link has, the arrow, and opens in a new tab.
const LINK: Record<ChipLink, { arrow: boolean; newTab: boolean }> = {
  inside: { arrow: false, newTab: false },
  outside: { arrow: true, newTab: true },
}

/** A link to one thing in No Origins, such as a meron, a project or a run: a small rounded link with its
 * small picture, its name and a note (agreed 18 Nov, "Links Drawn by Eidos"). A real link. Given another
 * site's address, it says so: the arrow after its name, and a new tab. */
export function Chip({ mark, note, className, children, href, target, rel, ...rest }: ChipProps) {
  const kind = LINK[insideNoOrigins(href) ? 'inside' : 'outside']
  return (
    <a
      href={href}
      target={kind.newTab ? '_blank' : target}
      rel={kind.newTab ? 'noopener noreferrer' : rel}
      className={[styles.chip, 'eio-type-style-body', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {mark && <span className={styles.mark} aria-hidden>{mark}</span>}
      <span>{children}</span>
      {note && <span className={[styles.note, 'eio-type-style-caption'].join(' ')}>{note}</span>}
      {kind.arrow && <Icon name="up-right" size="small" label="opens in a new tab" />}
    </a>
  )
}
