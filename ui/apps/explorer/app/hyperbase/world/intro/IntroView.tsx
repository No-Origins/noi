'use client'
// The intro of the world on the whole screen (intro.ts): this gives it a canvas of its own for three.js and the
// two shapes the page draws over it (the painted stroke and its outline), starts it, and takes all of it away
// again. Nothing here can be pressed: the user asked for no control (to see it again, open the page again).
//
// It is seen in Eidos's dark roles, whatever the page's theme, as the world is.
import { useEffect, useRef } from 'react'
import { playIntro, type Intro } from './intro'
import styles from './intro.module.css'

/** The "secondary colour (violet)" the user named, by its token: the base's lines show in it. (The stroke's lime
 * and the outline's violet are given by the page's style; the astroids glow in their own colour.) */
const SECONDARY = '--eio-color-action-secondary'

/** `onArrived`: called once when the eye has arrived where the world's eye stands. `onEnded`: called once when
 * the intro has run to its end. `leaving`: the intro goes, to show what is behind it. */
export function IntroView({ onArrived, onEnded, onError, leaving = false }: { onArrived?: () => void; onEnded?: () => void; onError?: (why: unknown) => void; leaving?: boolean } = {}) {
  const told = useRef({ onArrived, onEnded, onError })
  told.current = { onArrived, onEnded, onError }
  const stage = useRef<HTMLDivElement>(null)
  const logo = useRef<SVGGElement>(null)
  const lime = useRef<SVGPathElement>(null)
  const outline = useRef<SVGPathElement>(null)

  useEffect(() => {
    const host = stage.current
    if (!host || !logo.current || !lime.current || !outline.current) return
    const canvas = document.createElement('canvas')
    canvas.className = styles.canvas ?? ''
    host.append(canvas)
    const css = getComputedStyle(host)
    const intro = playIntro(
      { host, canvas, logo: logo.current, lime: lime.current, outline: outline.current },
      { background: css.backgroundColor, colour: token => css.getPropertyValue(token).trim(), secondary: SECONDARY },
      why => told.current.onError?.(why),
    )
    intro.arrived(() => told.current.onArrived?.())
    intro.ended(() => told.current.onEnded?.())
    // whoever asked for less motion sees where the intro ends, at once
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) intro.seek(intro.total)
    ;(window as unknown as { __intro?: Intro }).__intro = intro
    return () => {
      intro.close()
      canvas.remove()
      delete (window as unknown as { __intro?: Intro }).__intro
    }
  }, [])

  return (
    <div className={`${styles.intro ?? ''} ${leaving ? styles.leaving ?? '' : ''}`} data-theme="dark">
      <div ref={stage} className={styles.stage} role="img" aria-label="The logo of No Origins is painted as one stroke, then the world's platform is built behind it." />
      <svg className={styles.drawing} aria-hidden="true">
        <g ref={logo}>
          <path ref={lime} className={styles.lime} />
        </g>
        <path ref={outline} className={styles.outline} />
      </svg>
    </div>
  )
}
