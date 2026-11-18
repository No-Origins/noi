'use client'
// One element of the 3D world on a small black stage, for a page: drag to turn it, scroll or pinch to
// come closer. The drawing is the Stage (stage.ts); this only gives it a canvas and lays its words over.
// An element that moves by itself (the water) is drawn on every frame while the page shows it; with
// reduced motion asked for, it stays still.
import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { Stage, type Overlay, type Scene } from './stage.ts'
import styles from './Stage3D.module.css'

export interface Stage3DProps {
  scene: Scene
  /** What the picture shows, in words, for a screen reader. */
  label: string
}

export function Stage3D({ scene, label }: Stage3DProps) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const stage = useRef<Stage | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  const [over, setOver] = useState<Overlay>({ labels: [], marks: [] })
  const [cannot, setCannot] = useState(false)
  const started = useRef(0)
  const shown = useRef('')
  const seconds = () => (started.current ? (performance.now() - started.current) / 1000 : 0)
  // Lays the words and marks over only when they changed, so that a moving element does not redo the page.
  const paint = () => {
    if (!stage.current) return
    const next = stage.current.draw(seconds()), key = JSON.stringify(next)
    if (key !== shown.current) { shown.current = key; setOver(next) }
  }

  useEffect(() => {
    const c = canvas.current
    if (!c) return
    let s: Stage
    try { s = new Stage(c) } catch { setCannot(true); return }
    stage.current = s
    s.onChange = () => paint()                                   // a character arrived: draw again
    const fit = () => { s.resize(c.clientWidth, c.clientHeight, window.devicePixelRatio || 1); paint() }
    const observer = new ResizeObserver(fit)
    observer.observe(c)
    // Scrolling over the picture comes closer, and must not scroll the page.
    const wheel = (e: WheelEvent) => { e.preventDefault(); s.closer(Math.exp(e.deltaY * 0.0015)); paint() }
    c.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); c.removeEventListener('wheel', wheel); s.destroy(); stage.current = null }
  }, [])

  useEffect(() => {
    const s = stage.current
    if (!s) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    s.still = still
    s.set(scene)
    paint()
    if (!s.moves() || still) { started.current = 0; return }
    started.current = performance.now()
    let frame = requestAnimationFrame(function tick() { if (!document.hidden) paint(); frame = requestAnimationFrame(tick) })
    return () => cancelAnimationFrame(frame)
  }, [scene])

  const down = (e: PointerEvent<HTMLCanvasElement>) => { drag.current = { x: e.clientX, y: e.clientY }; e.currentTarget.setPointerCapture(e.pointerId) }
  const move = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!drag.current || !stage.current) return
    stage.current.turn(e.clientX - drag.current.x, e.clientY - drag.current.y)
    drag.current = { x: e.clientX, y: e.clientY }
    paint()
  }
  const up = () => { drag.current = null }

  return (
    <figure className={styles.stage}>
      <canvas ref={canvas} className={styles.canvas} role="img" aria-label={label} tabIndex={0}
        onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} />
      {over.marks.length > 0 && (
        <svg className={styles.marks} aria-hidden>
          {over.marks.map((m, i) => <line key={i} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} />)}
        </svg>
      )}
      {over.labels.map(l => (
        <p key={l.text} className={[styles.label, 'eio-type-style-label'].join(' ')}
          style={{ transform: `translate(${Math.round(l.x)}px, ${Math.round(l.y)}px) translate(-50%, calc(-100% - var(--eio-space-gap-inline)))` }}>{l.text}</p>
      ))}
      {cannot
        ? <p className={[styles.cannot, 'eio-type-style-body'].join(' ')}>This browser cannot draw 3D here.</p>
        : <figcaption className={[styles.hint, 'eio-type-style-caption'].join(' ')}>Drag to turn it. Scroll to come closer.</figcaption>}
    </figure>
  )
}
