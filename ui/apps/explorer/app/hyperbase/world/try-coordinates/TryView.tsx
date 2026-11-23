'use client'
// A TRY, NOT THE PLATFORM (21 Nov 2026, issue 117): the square land with four ways of seeing its coordinates
// (coordinates.ts). On the whole screen, over Studio's frame. No panel: keys switch the ways and the views,
// and the user was told them in the brainstorm (1 lines, 2 edge numbers, 3 markers, 4 pointer; A slant,
// T above, P a person's eyes).
import { useEffect, useRef, useState } from 'react'
import { openWorld, type World } from '../world'
import { openTry } from './coordinates'
import base from '../world.module.css'
import styles from './try.module.css'

export function TryView() {
  const stage = useRef<HTMLDivElement>(null)
  const [cannot, setCannot] = useState(false)

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = base.canvas ?? ''
    host.append(canvas)
    const css = getComputedStyle(host)
    let world: World | null = null
    let stop: (() => void) | null = null
    let left = false
    openWorld(canvas, { background: css.backgroundColor })
      .then(async w => {
        if (left) { w.close(); return }
        world = w
        const s = await openTry(w, host, {
          classes: {
            labels: styles.labels ?? '', label: styles.label ?? '', edge: styles.edge ?? '',
            crossing: styles.crossing ?? '', pointer: styles.pointer ?? '',
          },
          colour: token => css.getPropertyValue(token).trim(),
        })
        if (left) { s(); return }
        stop = s
        ;(window as unknown as { __world?: World }).__world = w
      })
      .catch(() => { if (!left) setCannot(true) })
    return () => {
      left = true
      stop?.()
      world?.close()
      canvas.remove()
      delete (window as unknown as { __world?: World }).__world
    }
  }, [])

  return (
    <div ref={stage} className={styles.stage} role="img" aria-label="A try: the square land and its coordinates.">
      {cannot && <p className={base.cannot}>This browser cannot draw the 3D world.</p>}
    </div>
  )
}
