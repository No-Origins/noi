import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react'
import type { ButtonLink, ButtonSize, ButtonVariant, ButtonWidth } from '@noi/eio-tokens/components'
import { Icon, type IconName } from '../Icon/Icon'
import { insideNoOrigins } from '../links/links'
import styles from './Button.module.css'

interface Look {
  /** Primary for the one main action, secondary for the other strong one, plain for the rest. */
  variant?: ButtonVariant
  /** 40 px, or 48 px for a screen's single big action. */
  size?: ButtonSize
  /** An action's icon, before its words. On a link it takes the arrow's place. */
  icon?: IconName
  /** Fill the width of the container. */
  wide?: boolean
}

/** Without an address: a real button. */
export interface ButtonProps extends Look, ButtonHTMLAttributes<HTMLButtonElement> {
  href?: undefined
}

/** With an address: a real link (agreed 18 Nov, "Links Drawn by Eidos"). Inside No Origins it stays a
 * button, with the arrow after its words, or the action's icon instead of the arrow; outside No Origins
 * it is words with a dashed underline and the arrow, and it opens in a new tab. */
export interface ButtonLinkProps extends Look, Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'children'> {
  href: string
  children: ReactNode
}

// Each option Mero holds for Button, and how it is drawn: a key missing here, or one Mero never approved,
// fails the type check (Component States, agreed 18 Nov).
const VARIANT: Record<ButtonVariant, string> = { primary: styles.primary, secondary: styles.secondary, plain: styles.plain }
const SIZE: Record<ButtonSize, string | undefined> = { default: undefined, large: styles.large }
const WIDTH: Record<ButtonWidth, string | undefined> = { content: undefined, wide: styles.wide }
const LINK: Record<ButtonLink, { button: boolean; arrow: boolean; newTab: boolean }> = {
  inside: { button: true, arrow: true, newTab: false },
  action: { button: true, arrow: false, newTab: false },
  outside: { button: false, arrow: true, newTab: true },
}

const look = ({ variant = 'plain', size = 'default', wide }: Look) =>
  [styles.button, VARIANT[variant], SIZE[size], WIDTH[wide ? 'wide' : 'content'], 'eio-type-style-label']

/** A real button: keyboards and screen readers work, it shows the focus ring and has a 44 px touch target.
 * Given an address, it is a real link instead. */
export function Button(props: ButtonProps | ButtonLinkProps) {
  if (props.href !== undefined) return <LinkButton {...props} />
  const { variant, size, icon, wide, className, children, type = 'button', ...rest } = props
  return (
    <button type={type} className={[...look({ variant, size, wide }), className].filter(Boolean).join(' ')} {...rest}>
      {icon && <Icon name={icon} size="small" />}
      {children}
    </button>
  )
}

/** Which of the three link states an address and an icon make. */
export function linkKind(href: string, icon?: IconName): ButtonLink {
  return !insideNoOrigins(href) ? 'outside' : icon ? 'action' : 'inside'
}

function LinkButton({ variant, size, icon, wide, className, children, href, target, rel, ...rest }: ButtonLinkProps) {
  const kind = LINK[linkKind(href, icon)]
  const drawn = kind.button ? [...look({ variant, size, wide }), styles.link] : [styles.outside]
  return (
    <a
      href={href}
      target={kind.newTab ? '_blank' : target}
      rel={kind.newTab ? 'noopener noreferrer' : rel}
      className={[...drawn, className].filter(Boolean).join(' ')}
      {...rest}
    >
      {kind.button && icon && <Icon name={icon} size="small" />}
      {children}
      {kind.arrow && <Icon name="up-right" size="small" label={kind.newTab ? 'opens in a new tab' : undefined} />}
    </a>
  )
}
