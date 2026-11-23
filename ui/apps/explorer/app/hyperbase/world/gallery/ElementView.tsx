'use client'
// One element in a 3D view, to be looked at from every side: a stage of its own (../world.ts) with the element
// alone on it, lit, and an eye the hand moves (../inspect.ts). Each time it shows it gets a fresh canvas, and
// gives everything back when it goes.
import { useEffect, useRef, useState } from 'react'
import type { Object3D } from 'three/webgpu'
import { calledIn, elementById, light, lightFor, makeElement, type WorldElement } from '@noi/eio-3d'
import { showElement, type Inspection } from '../inspect'
import { readPlace, writePlace } from '../place'
import { rideStrip, type Riding } from '../ride'
import { cutAbove, mobiusFrameAt, rideAlong, stripOf } from '../rideAlong'
import { openWorld, type World } from '../world'
import styles from './gallery.module.css'

/** What a check or a tool finds at `window.__inspect` while an element is shown. `make` makes any element by
 * its id, ready to be put into the stage's `xyz`: for a check that needs elements side by side. */
type Open = {
  world: World
  inspection: Inspection
  place: { read: typeof readPlace; write: typeof writePlace }
  make(id: string): Object3D | null
}

/** No colour is tried, and no setting. */
const NONE: Record<string, string> = {}
const NOTHING: Record<string, number> = {}

/** `on`: another element to show set on this one (where its sockets meet this one's studs), or none. `state`
 * and `onState`: the state the element, and what is set on it, is shown in, by its id. `through`: whether one
 * looks through the element ('it'), through what is set on it ('on'), or from outside (none). `colours` and
 * `onColours`: the colours tried on the element, and on what is set on it: each of its own colours by its id,
 * and the colour of Eidos it has for now. `settings` and `onSettings`: the settings tried on each of the two:
 * each of its own settings by its id, and the number it has for now. */
export function ElementView({ element, on = null, state = null, onState = null, through = null, colours = NONE, onColours = NONE, settings = NOTHING, onSettings = NOTHING, ride = false, onRide }: { element: WorldElement; on?: WorldElement | null; state?: string | null; onState?: string | null; through?: 'it' | 'on' | null; colours?: Record<string, string>; onColours?: Record<string, string>; settings?: Record<string, number>; onSettings?: Record<string, number>; ride?: boolean; onRide?: (y: number) => void }) {
  const stage = useRef<HTMLDivElement>(null)
  const [cannot, setCannot] = useState(false)
  // why a thing drawn from files (a character) cannot be drawn, in plain words, when it cannot
  const [trouble, setTrouble] = useState<string | null>(null)
  // the open 3D view, kept so that what is set on the element can change without opening the view again
  const [opened, setOpened] = useState<Inspection | null>(null)
  // a strip one rides along (ride.ts): seen as the world is, the scroll going along it, not the hand turning it
  const bend = element.shape.kind === 'laid' ? element.shape.bend : undefined
  // or a strip of another shape, with two ends (rideAlong.ts)
  const along = stripOf(element)
  const riding = ride && (!!bend || !!along)
  const told = useRef(onRide)
  told.current = onRide

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = styles.canvas ?? ''
    host.append(canvas)
    const css = getComputedStyle(host)
    let world: World | null = null
    let inspection: Inspection | null = null
    let left = false
    let ridden: Riding | null = null
    let uncut: (() => void) | null = null
    let unlit: (() => void) | null = null
    let gone: (() => void) | null = null
    setTrouble(null)
    openWorld(canvas, { background: css.backgroundColor }, riding ? 'orthographic' : 'perspective')
      .then(async w => {
        if (left) { w.close(); return }
        world = w
        const colour = (token: string) => css.getPropertyValue(token).trim()
        if (riding && (bend || along)) {
          unlit = light(w, colour, lightFor(w, colour(element.surface.colour)), true)
          const made = makeElement(w, element, colour)
          w.xyz.add(made.thing)
          gone = () => made.gone()
          ridden = bend ? rideStrip(w, bend, canvas) : rideAlong(w, along!, canvas, made.thing)
          // on the Möbius strip too, what comes between the eye and the strip is cut away (rideAlong.ts, issue 130)
          if (bend) {
            const clip = cutAbove(w, made.thing, y => mobiusFrameAt(bend, y))
            clip.at(ridden.y)
            ridden.moved(y => clip.at(y))
            uncut = () => clip.close()
          }
          ridden.moved(y => told.current?.(y))
          told.current?.(ridden.y)
          ;(window as unknown as { __ride?: { world: World; riding: Riding } }).__ride = { world: w, riding: ridden }
          return
        }
        const shown = await showElement(w, element, { background: css.backgroundColor, colour }, words => { if (!left) setTrouble(words) })
        if (left) { shown.close(); return }
        inspection = shown
        setOpened(shown)
        ;(window as unknown as { __inspect?: Open }).__inspect = {
          world: w,
          inspection: shown,
          place: { read: readPlace, write: writePlace },
          make: id => { const e = elementById(id); return e ? makeElement(w, e, colour).thing : null },
        }
      })
      .catch((why: unknown) => {
        console.error(why)
        if (!left) setCannot(true)
      })
    return () => {
      left = true
      setOpened(null)
      ridden?.close()
      uncut?.()
      gone?.()
      unlit?.()
      delete (window as unknown as { __ride?: unknown }).__ride
      inspection?.close()
      world?.close()
      canvas.remove()
      delete (window as unknown as { __inspect?: Open }).__inspect
    }
  }, [element, riding, bend, along])

  // what is set on the element follows the choice
  useEffect(() => { opened?.setOn(on) }, [opened, on])
  // a new thing set on it is drawn afresh: what was said of the last one no longer holds
  useEffect(() => { if (on) setTrouble(null) }, [on])
  // and so does the state each of the two is in
  useEffect(() => { if (opened && state) opened.state(state, 'it') }, [opened, state])
  useEffect(() => { if (opened && on && onState) opened.state(onState, 'on') }, [opened, on, onState])
  // and the colours tried on each of the two
  useEffect(() => { if (opened) for (const [id, token] of Object.entries(colours)) opened.colour(id, token, 'it') }, [opened, colours])
  useEffect(() => { if (opened && on) for (const [id, token] of Object.entries(onColours)) opened.colour(id, token, 'on') }, [opened, on, onColours])
  // and the settings tried on each of the two
  useEffect(() => { if (opened) for (const [id, value] of Object.entries(settings)) opened.set(id, value, 'it') }, [opened, settings])
  useEffect(() => { if (opened && on) for (const [id, value] of Object.entries(onSettings)) opened.set(id, value, 'on') }, [opened, on, onSettings])
  // and from where one looks: after what is set on, since one may look through that
  useEffect(() => { opened?.through(through) }, [opened, on, through])

  return (
    <div ref={stage} className={styles.view} data-theme="dark" role="img" aria-label={`${calledIn(element, true)} in 3D${on ? `, with ${calledIn(on)} set on it` : ''}.`}>
      {cannot && <p className={styles.cannot}>This browser cannot draw the 3D view.</p>}
      {!cannot && trouble && <p className={styles.cannot}>{trouble}</p>}
    </div>
  )
}
