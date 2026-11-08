'use client'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import styles from './Drawer.module.css'

export interface DrawerProps {
  open: boolean
  /** Called when it asks to close itself, on Escape. Give it a close button too. */
  onClose: () => void
  /** What the drawer is, read by screen readers, such as "Menu". */
  label: string
  /** The button that opens it, in window coordinates: it grows out of this circle and shrinks back
      into it. Without one it fades in and out. */
  from?: { x: number; y: number; radius: number }
  children: ReactNode
}

/**
 * A panel that covers the whole window, such as an app's menu where one pane fills the window.
 * It is a modal dialog: while it is open the page behind cannot be reached, and Escape closes it.
 * It arrives in 300 ms and leaves in 200 ms (instantly with reduced motion); its children are there
 * before it opens, so focus lands on the first of them, and stay until it has left.
 */
export function Drawer({ open, onClose, label, from, children }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const [mounted, setMounted] = useState(open)
  if (open && !mounted) setMounted(true)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) {
        dialog.showModal()
        dialog.dataset.motion = 'in'
      }
      return
    }
    if (!dialog.open) return
    // Leave first, then close: the page behind stays unreachable until the drawer has gone.
    dialog.dataset.motion = 'out'
    let done = false
    const finish = () => {
      if (done) return
      done = true
      delete dialog.dataset.motion
      dialog.close()
    }
    Promise.all(dialog.getAnimations().map(a => a.finished)).then(finish, finish)
  }, [open])
  const style = from && ({ '--from-x': `${from.x}px`, '--from-y': `${from.y}px`, '--from-r': `${from.radius}px` } as CSSProperties)
  return (
    <dialog
      ref={ref}
      className={[styles.drawer, from && styles.grows].filter(Boolean).join(' ')}
      style={style || undefined}
      aria-label={label}
      onCancel={e => { e.preventDefault(); onClose() }}
      onClose={() => { setMounted(false); if (open) onClose() }}
    >
      {mounted && <div className={styles.body}>{children}</div>}
    </dialog>
  )
}
