import type { CSSProperties, ReactNode } from 'react'
import type { TreeRowHolds, TreeRowState } from '@noi/eio-tokens/components'
import { Icon, type IconName } from '../Icon/Icon'
import styles from './TreeRow.module.css'

export interface TreeRowProps {
  name: string
  /** 0 for a top-level row; each level indents by the stack gap. */
  depth?: number
  /** true or false for a row that holds others; leave it out for a leaf. */
  open?: boolean
  /** With `open`, the arrow is its own button: it opens or closes the row's children, and the row
      itself still leads where it leads. Without it the arrow only shows the state. */
  onToggle?: () => void
  /** The row was just revealed by its parent's arrow: it drops in and fades up. */
  appear?: boolean
  /** A small picture of what the row is: a swatch, an icon or a text sample. */
  preview?: ReactNode
  count?: number
  selected?: boolean
  /** Where the row leads. With an address the row is a link; without one it is a button. */
  href?: string
  onSelect?: () => void
}

// What a row holds, and whether it is chosen, as Mero holds them for Tree row (Component States, agreed
// 18 Nov): a leaf has no arrow; an open row's arrow points down, a closed one's right.
const HOLDS: Record<TreeRowHolds, IconName | null> = { leaf: null, open: 'down', closed: 'right' }
const STATE: Record<TreeRowState, string | undefined> = { other: undefined, selected: styles.selected }

/** One row of a tree: a real link or button inside a tree item, so the keyboard reaches every row. */
export function TreeRow({ name, depth = 0, open, onToggle, appear, preview, count, selected, href, onSelect }: TreeRowProps) {
  const className = [styles.row, STATE[selected ? 'selected' : 'other'], 'eio-type-style-body'].filter(Boolean).join(' ')
  const style = { '--depth': depth } as CSSProperties
  const holds = HOLDS[open === undefined ? 'leaf' : open ? 'open' : 'closed']
  const arrow = holds && <Icon name={holds} size="small" />
  const content = (
    <>
      {/* With its own button the arrow sits over this slot; the slot keeps the row's shape. */}
      <span className={styles.chevron}>{!onToggle && arrow}</span>
      {preview && <span className={styles.preview}>{preview}</span>}
      <span className={styles.name}>{name}</span>
      {count !== undefined && <span className={[styles.count, 'eio-type-style-mono'].join(' ')}>{count}</span>}
    </>
  )
  return (
    <div role="treeitem" aria-level={depth + 1} aria-expanded={open} aria-selected={selected} className={[styles.item, appear && styles.appear].filter(Boolean).join(' ')} style={style}>
      {href ? (
        <a className={className} href={href} onClick={onSelect} aria-current={selected ? 'page' : undefined}>
          {content}
        </a>
      ) : (
        <button type="button" className={className} onClick={onSelect}>
          {content}
        </button>
      )}
      {onToggle && open !== undefined && (
        <button type="button" className={styles.toggle} onClick={onToggle} aria-expanded={open} aria-label={`${open ? 'Close' : 'Open'} ${name}`}>
          {arrow}
        </button>
      )}
    </div>
  )
}
