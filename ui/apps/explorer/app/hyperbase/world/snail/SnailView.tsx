'use client'
// THE SUPER SNAIL ON THE WHOLE SCREEN, A CONCEPT (27 Nov 2026). This opens a stage (../world.ts), lays the world's
// own wave platform on it as Eidos draws it (@noi/eio-3d), puts the snail on the platform (drawSnail.ts) and lets
// it do what snail.ts says, picture by picture.
//
// IT PLAYS BY ITSELF: a show that winds the shell up, bursts away, glides and crawls, over and over (snail.ts,
// SHOW). A HAND CAN TAKE OVER: while a finger, the mouse or the space bar is held, the shell is driven; let go, it
// runs down, and a few moments later the show goes on. At the platform's end the snail starts again from its
// beginning.
//
// OVER THE PICTURE lies one plate, made of what Eidos has (its Badge, its caption style): how fast the shell
// turns, the boost and the speed, so that it is seen that the boost follows the shell; and how to drive it.
// MY PICKS, not the user's word: the plate and its words; that a hand can drive the shell; and that for whoever
// asked their device for less motion nothing moves until they drive it themselves.
import { useEffect, useRef, useState } from 'react'
import { Badge } from '@noi/eio-react'
import { WAVE_PLATFORM, makeElement } from '@noi/eio-3d'
import { stripOf } from '../rideAlong'
import { openWorld, type World } from '../world'
import base from '../world.module.css'
import { drawSnail, type DrawnSnail } from './drawSnail'
import { atRest, later, showDrive, type Snail } from './snail'
import styles from './snail.module.css'

/** How long after a hand lets go the show goes on, in seconds. */
const HANDS_OFF = 3.5
/** Where the snail starts, and how far before the platform's end it starts again, in metres along it. */
const STARTS_AT = 14
const ENDS_BEFORE = 30
/** How often the plate's words are written afresh, in seconds. */
const WORDS_EVERY = 0.12

/** What a check or a tool finds at `window.__snail`: the open world, the snail as it is, and a way to hold the
 * picture and move it on by hand (`hold` stops the page's own clock; `on` moves the snail on by so many seconds,
 * its shell driven or not, in steps no longer than a picture's). */
type Open = { world: World; readonly snail: Snail; readonly shot: string; hold(): void; on(seconds: number, drive?: number): Snail; put(y: number): void }

export function SnailView() {
  const stage = useRef<HTMLDivElement>(null)
  const [cannot, setCannot] = useState(false)
  const [says, setSays] = useState<{ spin: number; boost: number; speed: number } | null>(null)

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = base.canvas ?? ''
    host.prepend(canvas)
    const css = getComputedStyle(host)
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let world: World | null = null
    let undo: Array<() => void> = []
    let left = false
    // whether a hand drives the shell now: a finger or the mouse held on the picture, or the space bar
    let pressed = false
    let key = false
    const press = (e: PointerEvent) => { if (e.isPrimary) pressed = true }
    const release = () => { pressed = false }
    const keyDown = (e: KeyboardEvent) => { if (e.code === 'Space') { key = true; e.preventDefault() } }
    const keyUp = (e: KeyboardEvent) => { if (e.code === 'Space') key = false }
    host.addEventListener('pointerdown', press)
    window.addEventListener('pointerup', release)
    window.addEventListener('pointercancel', release)
    window.addEventListener('blur', release)
    window.addEventListener('keydown', keyDown)
    window.addEventListener('keyup', keyUp)

    openWorld(canvas, { background: css.backgroundColor })
      .then(w => {
        if (left) { w.close(); return }
        world = w
        const colour = (token: string) => css.getPropertyValue(token).trim()
        const platform = makeElement(w, WAVE_PLATFORM, colour)
        w.xyz.add(platform.thing)
        const strip = stripOf(WAVE_PLATFORM)!
        const drawn: DrawnSnail = drawSnail(w, strip, colour)
        let snail = atRest(STARTS_AT)
        let seconds = 0 // the picture's own time
        let show = 0 // how far into the show it is
        let idle = HANDS_OFF // how long no hand has driven it
        let held = false // a check holds the picture and moves it on itself
        let wrote = 0
        const move = (passed: number, hand: number | null) => {
          const driven = hand !== null
          idle = driven ? 0 : idle + passed
          // the show goes on only when no hand has driven the shell for a while, and starts from its beginning
          const playing = !driven && idle >= HANDS_OFF && !calm
          if (driven) show = 0
          else if (playing) show += passed
          snail = later(snail, driven ? hand : playing ? showDrive(show) : 0, passed)
          if (snail.y > strip.long - ENDS_BEFORE) { snail = { ...snail, y: STARTS_AT }; drawn.jumped() }
          seconds += passed
          drawn.show(snail, seconds, passed)
        }
        drawn.show(snail, 0, 0)
        let last = performance.now()
        const stop = w.eachFrame(() => {
          const now = performance.now()
          const passed = Math.min((now - last) / 1000, 0.1)
          last = now
          if (held) return
          const hand = pressed || key ? 1 : null
          // with less motion asked for, nothing moves until a hand drives it; then it runs down and stops
          if (calm && hand === null && snail.boost < 0.01 && idle > HANDS_OFF) return
          move(passed, hand)
          if (seconds - wrote >= WORDS_EVERY) { wrote = seconds; setSays({ spin: snail.spin, boost: snail.boost, speed: snail.speed }) }
        })
        setSays({ spin: snail.spin, boost: snail.boost, speed: snail.speed })
        undo = [stop, () => drawn.gone(), () => platform.gone()]
        const open: Open = {
          world: w,
          get snail() { return snail },
          get shot() { return drawn.shot },
          hold() { held = true },
          on(time, drive) {
            for (let leftOver = time; leftOver > 1e-9; leftOver -= 1 / 60) move(Math.min(leftOver, 1 / 60), drive === undefined ? null : drive)
            setSays({ spin: snail.spin, boost: snail.boost, speed: snail.speed })
            return snail
          },
          put(y) { snail = { ...snail, y }; drawn.jumped(); drawn.show(snail, seconds, 0) },
        }
        ;(window as unknown as { __snail?: Open }).__snail = open
      })
      .catch((why: unknown) => {
        console.error(why)
        if (!left) setCannot(true)
      })
    return () => {
      left = true
      host.removeEventListener('pointerdown', press)
      window.removeEventListener('pointerup', release)
      window.removeEventListener('pointercancel', release)
      window.removeEventListener('blur', release)
      window.removeEventListener('keydown', keyDown)
      window.removeEventListener('keyup', keyUp)
      for (const fn of undo) fn()
      world?.close()
      canvas.remove()
      delete (window as unknown as { __snail?: Open }).__snail
    }
  }, [])

  return (
    <div ref={stage} className={styles.stage} data-theme="dark" role="img" aria-label="A concept: the Super Snail, a snail with a hero's scarf whose turning shell feeds two boosters, travelling along the world's wave platform.">
      {says && (
        <div className={styles.says}>
          <div className={styles.facts}>
            <Badge>Shell {says.spin.toFixed(1)} turns/s</Badge>
            <Badge>Boost {Math.round(says.boost * 100)}%</Badge>
            <Badge>Speed {Math.round(says.speed)} m/s</Badge>
          </div>
          <p className={`eio-type-style-caption ${styles.how}`}>Hold anywhere, or the space bar, to spin the shell.</p>
        </div>
      )}
      {cannot && <p className={base.cannot}>This browser cannot draw the 3D world.</p>}
    </div>
  )
}
