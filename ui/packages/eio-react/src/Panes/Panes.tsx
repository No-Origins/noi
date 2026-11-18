import type { ReactNode } from 'react'
import type { PanesWindow } from '@noi/eio-tokens/components'
import styles from './Panes.module.css'

// Each window Mero holds for Panes: what shows only there (Component States, agreed 18 Nov).
const WINDOW: Record<PanesWindow, string> = { one: styles.onePane, two: styles.twoPanes }

export interface PanesProps {
  /** The list: a tree, a set of batches. */
  list: ReactNode
  /** The page for what is chosen in the list. */
  children: ReactNode
}

/**
 * A list and the page for what is chosen in it. Where the window class has two panes they sit side
 * by side, the list a third of the width; where it has one, the page fills the window and the app
 * offers the list some other way, such as in a Drawer from a menu button. The page keeps the
 * window's margin and stops at the page width.
 */
export function Panes({ list, children }: PanesProps) {
  return (
    <div className={styles.panes}>
      <div className={styles.beside}>
        <aside className={styles.list}>{list}</aside>
      </div>
      <main className={styles.page}>{children}</main>
    </div>
  )
}

/** Shown only where one pane fills the window (compact and medium windows), such as a menu button. */
export function WhenOnePane({ children }: { children: ReactNode }) {
  return <div className={WINDOW.one}>{children}</div>
}

/** Shown only where two panes sit side by side (expanded windows). */
export function WhenTwoPanes({ children }: { children: ReactNode }) {
  return <div className={WINDOW.two}>{children}</div>
}
