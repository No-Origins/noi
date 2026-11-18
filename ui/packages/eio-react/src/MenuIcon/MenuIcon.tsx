import type { MenuIconState } from '@noi/eio-tokens/components'
import styles from './MenuIcon.module.css'

// Each state Mero holds for the menu icon (Component States, agreed 18 Nov).
const STATE: Record<MenuIconState, string | undefined> = { shut: undefined, open: styles.open }

/**
 * The menu icon that turns into a close icon: ☰ while the menu is shut, ✕ while it is open. The
 * outer lines turn and meet and the middle one goes, so one button opens and closes the menu.
 * Drawn on the same 20-unit grid as Icon, at the small size Button uses.
 */
export function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg
      className={[styles.icon, STATE[open ? 'open' : 'shut']].filter(Boolean).join(' ')}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
    >
      <path className={[styles.line, styles.top].join(' ')} d="M3 5.5h14" />
      <path className={[styles.line, styles.middle].join(' ')} d="M3 10h14" />
      <path className={[styles.line, styles.bottom].join(' ')} d="M3 14.5h14" />
    </svg>
  )
}
