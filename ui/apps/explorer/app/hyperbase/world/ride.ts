// RIDING ALONG THE STRIP (23 Nov 2026, issue 127, piece 52). The user: "try to fix a camera, because I wanted to
// understand how we are imagining scroll in the world. So as I scroll, the part where we are looking at should
// always be like what isometric view we are currently looking at in the world. So maybe either as we scroll, we
// can just move the camera in an isometric view parallel to the right side of the strip, or any other way
// possible."
//
// The eye sees as the world's does (orthographic, the same corner, the same share of the picture, land.ts) but in
// the strip's own across, along and up where it looks (bend.ts): so the part of the strip in the middle of the
// picture always looks as the flat world does, and as the strip twists and curves, the rest of the loop turns
// round it. Scrolling on goes toward the end, as in the world. Going once round brings the eye to the same place
// on the strip's other face, x the other way round; twice round, back to the start.
//
// MY PICKS, not the user's word: the eye looks at the strip's middle line (x 0); it glides to where it was
// scrolled to, as the world's eye does (eye.ts, GLIDE); the scroll has no end (it goes on round the loop).
import { frameOf, lengthOf, type Bend, type Xyz } from './bend.ts'
import { GLIDE } from './eye.ts'
import { isometricOver, pictureHolds, startOfLand, wayInPicture } from './land.ts'
import { at, toThree } from './place.ts'
import type { World } from './world.ts'

/** Where the eye of a ride looks: the strip's y along its middle line (more than once round goes on to the other
 * face), and the place there in the stage's x, y, z. */
export interface Riding {
  /** Where the eye is now, along the strip. */
  readonly y: number
  /** Puts the eye at y along the strip at once. */
  put(y: number): void
  /** Calls `fn` whenever the eye has gone on along the strip. Returns what stops it. */
  moved(fn: (y: number) => void): () => void
  close(): void
}

/** How many dots one line of scroll counts for, where a mouse scrolls by lines (as on the world's page). */
const DOTS_A_LINE = 16

/** Lets the eye of `world` (which must see orthographic) ride along the strip laid by `bend`, moved by the scroll
 * on `canvas`. */
export function rideStrip(world: World, bend: Bend, canvas: HTMLCanvasElement): Riding {
  const camera = world.camera
  if ('fov' in camera) throw new Error('A ride along the strip sees as the world does: orthographic.')
  const L = lengthOf(bend)
  const land = startOfLand()
  // the world's own view: how far back the eye stands along x, y and up, and how much the picture holds
  const view = isometricOver(at(0, 0))
  const back = { x: view.from.x - view.at.x, y: view.from.y - view.at.y, z: view.from.z - view.at.z }
  const holds = () => pictureHolds(land, (canvas.clientWidth || 1) / (canvas.clientHeight || 1))
  world.shows(holds())
  const observer = new ResizeObserver(() => world.shows(holds()))
  observer.observe(canvas)

  // once round is the other face, x the other way round: twice round is back at the start
  const sightAt = (y: number): { from: Xyz; at: Xyz; up: Xyz } => {
    const round = Math.floor(y / L)
    const f = frameOf(bend, 0, y - round * L)
    const k = round % 2 === 0 ? 1 : -1
    const [across, along, up] = [{ x: f.across.x * k, y: f.across.y * k, z: f.across.z * k }, f.along, { x: f.up.x * k, y: f.up.y * k, z: f.up.z * k }]
    const from = {
      x: f.at.x + across.x * back.x + along.x * back.y + up.x * back.z,
      y: f.at.y + across.y * back.x + along.y * back.y + up.y * back.z,
      z: f.at.z + across.z * back.x + along.z * back.y + up.z * back.z,
    }
    return { from, at: f.at, up }
  }
  const see = (y: number) => {
    const s = sightAt(y)
    camera.position.set(...toThree(at(s.from.x, s.from.y, s.from.z)))
    // the eye's own three ways, worked out in three.js's order (whose turn the user's order does not keep): it
    // looks along its own minus z, with its up as the strip's up there
    const V = world.three.Vector3
    const [from, to, up] = [new V(...toThree(at(s.from.x, s.from.y, s.from.z))), new V(...toThree(at(s.at.x, s.at.y, s.at.z))), new V(...toThree(at(s.up.x, s.up.y, s.up.z)))]
    const back = from.sub(to).normalize()
    const right = up.clone().cross(back).normalize()
    const top = back.clone().cross(right)
    camera.quaternion.setFromRotationMatrix(new world.three.Matrix4().makeBasis(right, top, back))
  }

  let [now, goal, last] = [0, 0, performance.now()]
  const told = new Set<(y: number) => void>()
  const wrap = (y: number) => ((y % (2 * L)) + 2 * L) % (2 * L)
  see(now)
  const stop = world.eachFrame(() => {
    const t = performance.now()
    const share = 1 - Math.exp(0 - Math.min((t - last) / 1000, 0.1) / GLIDE)
    last = t
    if (now === goal) return
    now = Math.abs(goal - now) < 0.001 ? goal : now + (goal - now) * share
    see(wrap(now))
    for (const fn of [...told]) fn(wrap(now))
  })
  const onScroll = (e: WheelEvent) => {
    if (e.ctrlKey) return // a pinch is not a scroll
    e.preventDefault()
    const dots = e.deltaY * (e.deltaMode === 1 ? DOTS_A_LINE : e.deltaMode === 2 ? canvas.clientHeight : 1)
    // as on the world's page: the strip moves in the picture as far as was scrolled
    const dotsAMetre = ((canvas.clientHeight || 1) / holds()) * wayInPicture(land)
    if (dots !== 0) goal += (dots * land.picks.scrollGain) / dotsAMetre
  }
  canvas.addEventListener('wheel', onScroll, { passive: false })
  return {
    get y() { return wrap(now) },
    put(y) {
      ;[now, goal] = [y, y]
      see(wrap(y))
      for (const fn of [...told]) fn(wrap(y))
    },
    moved(fn) {
      told.add(fn)
      return () => { told.delete(fn) }
    },
    close() {
      stop()
      told.clear()
      observer.disconnect()
      canvas.removeEventListener('wheel', onScroll)
    },
  }
}
