'use client'
// The new 3D world on the whole screen: the land and its coordinates. This gives the world (world.ts) a canvas
// of its own, opens the land as data (land.ts), lets the picture follow it (drawLand.ts), and takes all of it
// away again. Each time the page shows the world it gets a fresh canvas, so two renderers never share one.
//
// OVER THE WORLD there is only what the user asked for (21 Nov: the first world's panels took over). So far one
// thing, in their words: "add toggle to turn off the markers that we currently have on the world", and then:
// "By markers, I meant x and y axis, and at the same time, all the numbers on x and y axis", "along with the
// previous markers" (the upright ones at the crossings), "along with all the 1 meter X and Y lines too", and
// of the 10 m lines: "Those markers too"; and of the names of the land's four sides (22 Nov): "just markers,
// part of the markers". It is Eidos's Toggle (a Checkbox until 22 Nov 2026, while Eidos had no toggle; the
// user then agreed one for the design system, and that this control becomes it: issue 128 in noi-planning).
// Its word names the thing and does not change with its state. It does nothing of its own: it names a
// change to the land (land.ts says what the markers are), and shows what the land says.
//
// THE WORDS ON THE LAND are drawn with what the design system already has (the user, 22 Nov: "anything that
// you're adding, any element, you have to first check if it's existing in the design system"; and of the
// land's other words: "Yes, those too"). The names of the sides, the markers' places and the place under the
// pointer are Eidos's Badge: the picture keeps a spot over each place (drawLand.ts) and LandWords.tsx draws the
// Badge into it. The numbers along the edges are plain words in Eidos's caption style.
//
// The world is seen in Eidos's dark roles, whatever the page's theme: its land and sky are dark in both, and a
// role that differs by theme (the tile's border) must not.
import { useEffect, useRef, useState } from 'react'
import { Toggle } from '@noi/eio-react'
import { drawLand, type WordSpot } from './drawLand'
import { LAID_BY_THE_USER, changed, markersShown, openLand, startOfLand, type Change, type Land } from './land'
import { LandWords } from './LandWords'
import { WAVE_PLATFORM } from '@noi/eio-3d'
import { fromThree, readPlace, readSpan, toThree, writePlace, writeSpan } from './place'
import { stripOf } from './rideAlong'
import { openWorld, type World } from './world'
import styles from './world.module.css'

/** What a check or a tool finds at `window.__world`: the open world, the land's data and its one way to change
 * it, and the reading and writing of places. */
type Open = World & {
  land: Land
  place: { read: typeof readPlace; write: typeof writePlace; readSpan: typeof readSpan; writeSpan: typeof writeSpan; toThree: typeof toThree; fromThree: typeof fromThree }
}

/** `onOpen`: called once the world is open and its land is drawn (the intro that opens the world waits for it:
 * intro/WorldOpens.tsx). */
export function WorldView({ onOpen }: { onOpen?: () => void } = {}) {
  const stage = useRef<HTMLDivElement>(null)
  const [cannot, setCannot] = useState(false)
  // the open land, and whether it shows its markers: kept here only to draw the toggle, never to decide
  const [land, setLand] = useState<Land | null>(null)
  const [markers, setMarkers] = useState(true)
  // the spots the picture keeps over the places of the land's words: each word is drawn into its spot
  const [spots, setSpots] = useState<readonly WordSpot[]>([])

  useEffect(() => {
    const host = stage.current
    if (!host) return
    const canvas = document.createElement('canvas')
    canvas.className = styles.canvas ?? ''
    host.append(canvas)
    const css = getComputedStyle(host)
    let world: World | null = null
    let undraw: (() => void) | null = null
    let unwatch: (() => void) | null = null
    let left = false
    // the land is seen in an isometric view (the user, 22 Nov), which needs an eye that sees orthographic
    openWorld(canvas, { background: css.backgroundColor }, 'orthographic')
      .then(async w => {
        if (left) { w.close(); return }
        world = w
        // THE LAND IS LAID ALONG THE WAVE PLATFORM, ITS CURL TOWARD HIGH x (23 Nov 2026, issue 130). The user: "Now
        // let's replace the [high-x] curl platform that we built in the world, and also the same markers along with
        // the same effects that they had, and also the elements that we placed." So the land runs as long as the
        // strip, covered as before, with what the user laid; the picture bends it all onto the strip (drawLand.ts).
        const strip = stripOf(WAVE_PLATFORM)!
        const laid: Change[] = [{ what: 'edge', long: strip.long }, { what: 'cover' }, ...LAID_BY_THE_USER]
        const opened = openLand(laid.reduce(changed, startOfLand())) // with what the user laid
        const stop = await drawLand(w, opened, host, {
          // a number along an edge: Eidos's own caption style, and its colour
          classes: { words: styles.words ?? '', edgeNumber: `eio-type-style-caption ${styles.edgeNumber ?? ''}` },
          colour: token => css.getPropertyValue(token).trim(),
          spots: told => { if (!left) setSpots(told) },
          strip,
        })
        if (left) { stop(); return }
        undraw = stop
        unwatch = opened.watch(now => setMarkers(markersShown(now)))
        setMarkers(markersShown(opened.state))
        setLand(opened)
        onOpen?.()
        const open: Open = Object.assign(w, { land: opened, place: { read: readPlace, write: writePlace, readSpan, writeSpan, toThree, fromThree } })
        ;(window as unknown as { __world?: Open }).__world = open
      })
      .catch((why: unknown) => {
        console.error(why)
        if (!left) setCannot(true)
      })
    return () => {
      left = true
      unwatch?.()
      setLand(null)
      setSpots([])
      undraw?.()
      world?.close()
      canvas.remove()
      delete (window as unknown as { __world?: Open }).__world
    }
  }, [])

  return (
    <div className={styles.world} data-theme="dark">
      <div ref={stage} className={styles.stage} role="img" aria-label="The 3D world: a land 210 metres across laid along a wave and a circular twist, with tiles and its coordinates." />
      {land && <LandWords land={land} spots={spots} />}
      {land && (
        <div className={styles.controls}>
          <Toggle checked={markers} onChange={e => land.change({ what: 'markers', on: e.target.checked })}>Markers</Toggle>
        </div>
      )}
      {cannot && <p className={styles.cannot}>This browser cannot draw the 3D world.</p>}
    </div>
  )
}
