import type { ReactNode } from 'react'
import type { IconName, IconSize } from '@noi/eio-tokens/components'
import styles from './Icon.module.css'

export type { IconName, IconSize }

// Stroke icons drawn on a 20-unit grid. They take the current text color, so they follow any role.
// Every icon Mero holds for the set, and no other: a name missing here, or one Mero never approved,
// fails the type check (Component States, agreed 18 Nov).
const PATHS: Record<IconName, ReactNode> = {
  search: <><circle cx="9" cy="9" r="6" /><path d="M14 14l4 4" /></>,
  right: <path d="M7 4l6 6-6 6" />,
  down: <path d="M4 7l6 6 6-6" />,
  left: <path d="M13 4l-6 6 6 6" />,
  check: <><circle cx="10" cy="10" r="8" /><path d="M6.5 10.2l2.4 2.4 4.6-4.8" /></>,
  /* A checkbox's mark: drawn bolder, since it sits small inside the box. */
  tick: <path d="M4.5 10.5l3.5 3.5 7.5-8" strokeWidth={2.5} />,
  x: <><circle cx="10" cy="10" r="8" /><path d="M7.2 7.2l5.6 5.6M12.8 7.2l-5.6 5.6" /></>,
  warn: <><path d="M10 2.8l8 14H2z" /><path d="M10 8v4M10 14.6v.1" /></>,
  dash: <><circle cx="10" cy="10" r="8" /><path d="M6.5 10h7" /></>,
  plus: <path d="M10 4v12M4 10h12" />,
  minus: <path d="M4 10h12" />,
  close: <path d="M5 5l10 10M15 5L5 15" />,
  arrow: <path d="M3 10h14M12 5l5 5-5 5" />,
  /* Up and to the right, at 45 degrees: a link to a place (agreed 18 Nov, "Links Drawn by Eidos"). */
  'up-right': <path d="M6 14l8-8M8 6h6v6" />,
  fit: <path d="M3 7V3h4M13 3h4v4M17 13v4h-4M7 17H3v-4" />,
  layers: <><path d="M10 2.5l7.5 4-7.5 4-7.5-4z" /><path d="M2.5 10.5l7.5 4 7.5-4" /></>,
  doc: <><path d="M5 2.5h7l3.5 3.5v11.5H5z" /><path d="M12 2.5V6h3.5M7.5 10h5M7.5 13h5" /></>,
  pen: <><path d="M13.5 3.5l3 3L7 16H4v-3z" /><path d="M11.5 5.5l3 3" /></>,
  drop: <path d="M10 2.5c3 3.6 5.5 6.6 5.5 9.5a5.5 5.5 0 0 1-11 0c0-2.9 2.5-5.9 5.5-9.5z" />,
  user: <><circle cx="10" cy="7" r="3.5" /><path d="M3.5 17.5c1-3.5 3.6-5 6.5-5s5.5 1.5 6.5 5" /></>,
  agent: <><rect x="3.5" y="5.5" width="13" height="11" rx="4" /><path d="M10 2.5v3M7.5 10.5v1M12.5 10.5v1" /></>,
  key: <><circle cx="6.5" cy="13.5" r="3.5" /><path d="M9 11l8-8M14 6l2 2M12 8l2 2" /></>,
  /* Your touch: on a button that asks for Touch ID before it acts. The key stays for passkeys. */
  fingerprint: <>
    <path d="M3.5 13.5V10a6.5 6.5 0 0 1 11.5-4.2" />
    <path d="M16.4 8.6c.1.5.1 2.4.1 3.4 0 1.5-.3 3-.7 4.4" />
    <path d="M6.3 16.8c.5-1.4.7-2.9.7-4.8V10a3 3 0 0 1 6 0v1.5c0 2.1-.3 4.1-.9 5.9" />
    <path d="M10 10.5V12c0 2.1-.4 4.1-1.1 5.8" />
  </>,
  eye: <><path d="M1.5 10S5 3.5 10 3.5 18.5 10 18.5 10 15 16.5 10 16.5 1.5 10 1.5 10z" /><circle cx="10" cy="10" r="2.5" /></>,
  theme: <><circle cx="10" cy="10" r="7" /><path d="M10 3a7 7 0 0 1 0 14z" fill="currentColor" /></>,
  comp: <rect x="2.5" y="6" width="15" height="8" rx="4" />,
  menu: <path d="M3 5.5h14M3 10h14M3 14.5h14" />,
}

const SIZE: Record<IconSize, string> = { small: styles.small, default: styles.default, large: styles.large }

export interface IconProps {
  name: IconName
  /** 16, 20 or 24 px, from the icon size tokens. */
  size?: IconSize
  /** Say what the icon means when nothing else does; otherwise it is hidden from screen readers. */
  label?: string
  className?: string
}

export function Icon({ name, size = 'default', label, className }: IconProps) {
  return (
    <svg
      className={[styles.icon, SIZE[size], className].filter(Boolean).join(' ')}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {PATHS[name]}
    </svg>
  )
}
