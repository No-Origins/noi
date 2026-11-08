'use client'
// The menu where one pane fills the window: the views, this view's list (the tree, or the batches)
// and Theme, covering the whole window. It grows out of ☰ while ☰ turns into ✕ in the same place,
// so the one button opens and closes it; its head repeats the top bar. It closes when you go
// somewhere, or when the window grows wide enough for the list to sit beside the page.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Button, Drawer, MenuIcon } from '@noi/eio-react'
import { Live } from './Live'
import { ThemeToggle } from './ThemeToggle'
import styles from './topbar.module.css'

export function Menu({ tabs, list, live }: { tabs: ReactNode; list?: ReactNode; live?: number }) {
  const [open, setOpen] = useState(false)
  // ✕ shows a frame after the menu opens, so ☰ visibly turns into it; it turns back as the menu leaves.
  const [cross, setCross] = useState(false)
  const [from, setFrom] = useState<{ x: number; y: number; radius: number }>()
  const button = useRef<HTMLSpanElement>(null)
  const pathname = usePathname()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return setCross(false)
    let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(() => setCross(true)) })
    return () => cancelAnimationFrame(frame)
  }, [open])
  useEffect(() => {
    if (!open) return
    const check = () => { if (!button.current?.checkVisibility()) setOpen(false) }
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [open])
  const show = () => {
    const r = button.current?.getBoundingClientRect()
    if (r) setFrom({ x: r.left + r.width / 2, y: r.top + r.height / 2, radius: r.width / 2 })
    setOpen(true)
  }
  return (
    <>
      <span ref={button} className={styles.menuButton}>
        <Button icon="menu" aria-label="Open the menu" aria-expanded={open} onClick={show} />
      </span>
      <Drawer open={open} onClose={() => setOpen(false)} label="Menu" from={from}>
        <div className={styles.menuHead}>
          <Button aria-label="Close the menu" onClick={() => setOpen(false)}>
            <MenuIcon open={cross} />
          </Button>
          <span className={styles.brand}>
            <span className={[styles.brandLabel, 'eio-type-style-label'].join(' ')}>NOI</span>
            <span className="eio-type-style-heading">Explorer</span>
          </span>
          {live !== undefined && <span className={styles.end}><Live count={live} /></span>}
        </div>
        <div className={styles.tabsRow}>{tabs}</div>
        {list}
        <div className={styles.menuFoot}>
          <ThemeToggle />
        </div>
      </Drawer>
    </>
  )
}
