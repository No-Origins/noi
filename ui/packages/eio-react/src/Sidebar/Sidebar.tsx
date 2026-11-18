import { Children, useId, type HTMLAttributes, type ReactNode, type Ref } from 'react'
import type { SidebarList } from '@noi/eio-tokens/components'
import styles from './Sidebar.module.css'

export interface SidebarGroup {
  /** Shown above the group's rows, and read as the group's name. */
  name: string
  /** The group's rows: TreeRows. */
  rows: ReactNode
}

export interface SidebarProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
  /** What the list is, read by screen readers, such as "Merons" or "Governance". */
  label: string
  /** Above the rows: a search field, or a line that says who is looking. */
  top?: ReactNode
  /** The rows of a list with one group: TreeRows. */
  children?: ReactNode
  /** Or the rows in named groups, each under its name. */
  groups?: SidebarGroup[]
  /** Said in place of the rows when there are none, such as "Nothing matches". */
  empty?: ReactNode
  ref?: Ref<HTMLElement>
}

/**
 * The list beside a page: what you choose from, such as the tree of merons, the batches in Review or
 * Governance's pages. It is the page's navigation, so it is a real nav with its name, and its rows
 * are TreeRows in a tree, so the keyboard reaches every one. It draws the list only: the app places
 * it, beside the page with Panes where two panes fit, in a Drawer where one fills the window.
 */
// The two ways it holds its rows, as Mero holds them for Sidebar (Component States, agreed 18 Nov): a
// way missing here, or one Mero never approved, fails the type check.
const LIST: Record<SidebarList, (rows: { id: string; label: string; children?: ReactNode; groups?: SidebarGroup[] }) => ReactNode> = {
  // No tree without rows: an empty tree says nothing, and `empty` says why.
  one: ({ label, children }) =>
    Children.toArray(children).length > 0 && <div role="tree" aria-label={label} className={styles.rows}>{children}</div>,
  groups: ({ id, groups = [] }) =>
    groups.map((group, i) => (
      <section key={group.name} className={styles.group}>
        <h2 id={`${id}-${i}`} className={[styles.groupName, 'eio-type-style-label'].join(' ')}>{group.name}</h2>
        <div role="tree" aria-labelledby={`${id}-${i}`} className={styles.rows}>{group.rows}</div>
      </section>
    )),
}

export function Sidebar({ label, top, children, groups, empty, className, ref, ...rest }: SidebarProps) {
  const id = useId()
  return (
    <nav ref={ref} className={[styles.sidebar, className].filter(Boolean).join(' ')} aria-label={label} {...rest}>
      {top}
      {LIST[groups ? 'groups' : 'one']({ id, label, children, groups })}
      {empty && <p className={[styles.empty, 'eio-type-style-caption'].join(' ')}>{empty}</p>}
    </nav>
  )
}
