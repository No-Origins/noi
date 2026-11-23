// RIDING ALONG A STRIP THAT HAS AN END (23 Nov 2026, issue 130). The user: "Give me ride along it options for the
// other strips too, just like the [Möbius] strip." So the wave platforms are ridden as the Möbius strip is
// (ride.ts): the eye sees as the world's does, orthographic from the same corner, in the strip's own across, along
// and up where it looks, so the part in the middle of the picture always looks as the flat world does. Scrolling on
// goes toward the end. Unlike the Möbius strip, these strips have two ends: the scroll stops at each.
//
// ride.ts is the Möbius strip's and is left as it is; this does the same for any strip laid with a frame of its
// own (Laid.frame, @noi/eio-3d).
// MY PICKS, not the user's word: the eye looks at the strip's middle line (x 0); it glides as the world's eye does.
//
// WHAT COMES BETWEEN THE EYE AND THE STRIP IS CUT AWAY. The user, riding down the first wave: "since the other curve
// is very close to the going down part of the first wave, it overlaps in the camera view. Can we do something about
// it?" Going down the wave, the eye stands in the valley between that slope and the climb toward the twist, so the
// climb came between. Now whatever stands more than CLEAR metres above the strip where the eye looks (on the eye's
// side of it) is not drawn while riding. MY PICK: the 40 m.
import type { Object3D } from 'three/webgpu'
import { bentFrame as frameOfBend, bentLength as lengthOfBend, type Bend, type Frame, type Laid, type WorldElement, type Xyz } from '@noi/eio-3d'
import { GLIDE } from './eye.ts'
import { isometricOver, pictureHolds, startOfLand, wayInPicture } from './land.ts'
import { at, toThree } from './place.ts'
import type { Riding } from './ride.ts'
import type { World } from './world.ts'

/** A strip one can ride along: where its place x, y is and its ways there, and how long it is along y. */
export interface Strip {
  readonly frame: (x: number, y: number) => Frame
  readonly long: number
}

const strips = new WeakMap<Laid, Strip>()

/** The strip an element is laid on, when it has a frame of its own (not the Möbius strip's bend), else nothing.
 * The same each time for the same element, so a view can tell when it changes. */
export function stripOf(element: WorldElement): Strip | undefined {
  const shape = element.shape
  if (shape.kind !== 'laid' || !shape.frame || shape.bend) return undefined
  let strip = strips.get(shape)
  if (!strip) {
    // as long as its last row reaches
    const long = Math.max(...shape.things.map(t => t.at.y + t.element.size.y / 2))
    strip = { frame: shape.frame, long }
    strips.set(shape, strip)
  }
  return strip
}

/** How many dots one line of scroll counts for, where a mouse scrolls by lines (as on the world's page). */
const DOTS_A_LINE = 16

/** How far above the strip, where the eye looks, things are still drawn while riding (metres). */
export const CLEAR = 40

/** Lets the eye of `world` (which must see orthographic) ride along `strip`, moved by the scroll on `canvas`, from
 * y 0 to its end. What of `thing` stands more than CLEAR above the strip where the eye looks is not drawn. */
export function rideAlong(world: World, strip: Strip, canvas: HTMLCanvasElement, thing?: Object3D): Riding {
  const camera = world.camera
  if ('fov' in camera) throw new Error('A ride along the strip sees as the world does: orthographic.')
  const land = startOfLand()
  // the world's own view: how far back the eye stands along x, y and up, and how much the picture holds
  const view = isometricOver(at(0, 0))
  const back = { x: view.from.x - view.at.x, y: view.from.y - view.at.y, z: view.from.z - view.at.z }
  const holds = () => pictureHolds(land, (canvas.clientWidth || 1) / (canvas.clientHeight || 1))
  world.shows(holds())
  const observer = new ResizeObserver(() => world.shows(holds()))
  observer.observe(canvas)

  const sightAt = (y: number): { from: Xyz; at: Xyz; up: Xyz } => {
    const f = strip.frame(0, y)
    const [across, along, up] = [f.across, f.along, f.up]
    const from = {
      x: f.at.x + across.x * back.x + along.x * back.y + up.x * back.z,
      y: f.at.y + across.y * back.x + along.y * back.y + up.y * back.z,
      z: f.at.z + across.z * back.x + along.z * back.y + up.z * back.z,
    }
    return { from, at: f.at, up }
  }
  // what stands more than CLEAR above the strip where the eye looks is cut away
  const clip = thing ? cutAbove(world, thing, y => strip.frame(0, y)) : null
  const see = (y: number) => {
    clip?.at(y)
    const s = sightAt(y)
    camera.position.set(...toThree(at(s.from.x, s.from.y, s.from.z)))
    // the eye's own three ways, in three.js's order: it looks along its own minus z, its up the strip's up there
    const V = world.three.Vector3
    const [from, to, up] = [new V(...toThree(at(s.from.x, s.from.y, s.from.z))), new V(...toThree(at(s.at.x, s.at.y, s.at.z))), new V(...toThree(at(s.up.x, s.up.y, s.up.z)))]
    const away = from.sub(to).normalize()
    const right = up.clone().cross(away).normalize()
    const top = away.clone().cross(right)
    camera.quaternion.setFromRotationMatrix(new world.three.Matrix4().makeBasis(right, top, away))
  }

  const within = (y: number) => Math.min(Math.max(y, 0), strip.long)
  let [now, goal, last] = [0, 0, performance.now()]
  const told = new Set<(y: number) => void>()
  see(now)
  const stop = world.eachFrame(() => {
    const t = performance.now()
    const share = 1 - Math.exp(0 - Math.min((t - last) / 1000, 0.1) / GLIDE)
    last = t
    if (now === goal) return
    now = Math.abs(goal - now) < 0.001 ? goal : now + (goal - now) * share
    see(now)
    for (const fn of [...told]) fn(now)
  })
  const onScroll = (e: WheelEvent) => {
    if (e.ctrlKey) return // a pinch is not a scroll
    e.preventDefault()
    const dots = e.deltaY * (e.deltaMode === 1 ? DOTS_A_LINE : e.deltaMode === 2 ? canvas.clientHeight : 1)
    // as on the world's page: the strip moves in the picture as far as was scrolled
    const dotsAMetre = ((canvas.clientHeight || 1) / holds()) * wayInPicture(land)
    if (dots !== 0) goal = within(goal + (dots * land.picks.scrollGain) / dotsAMetre)
  }
  canvas.addEventListener('wheel', onScroll, { passive: false })
  return {
    get y() { return now },
    put(y) {
      ;[now, goal] = [within(y), within(y)]
      see(now)
      for (const fn of [...told]) fn(now)
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
      clip?.close()
    },
  }
}

/** Cuts away what of `thing` stands more than CLEAR above a strip, where the eye looks at y along it (`frameAt`
 * says the strip's middle there, and its ways). `at` moves the cut; `close` puts the thing back as it was. */
export function cutAbove(world: World, thing: Object3D, frameAt: (y: number) => Frame): { at(y: number): void; close(): void } {
  const THREE = world.three
  const cut = new THREE.Plane()
  const home = thing.parent
  const clipped = new THREE.ClippingGroup()
  clipped.clippingPlanes = [cut]
  if (home) { home.add(clipped); clipped.add(thing) }
  const p = (v: Xyz) => new THREE.Vector3(...toThree(at(v.x, v.y, v.z)))
  return {
    at(y) {
      const f = frameAt(y)
      // three.js keeps what lies on the side the plane's normal points to: here, toward the strip
      const from = p({ x: f.at.x + f.up.x * CLEAR, y: f.at.y + f.up.y * CLEAR, z: f.at.z + f.up.z * CLEAR })
      const down = p({ x: f.at.x - f.up.x, y: f.at.y - f.up.y, z: f.at.z - f.up.z }).sub(p(f.at)).normalize()
      cut.setFromNormalAndCoplanarPoint(down, from)
    },
    close() {
      if (home) home.add(thing)
      clipped.removeFromParent()
    },
  }
}

/** The Möbius strip's middle where its ride (ride.ts) looks at y: once round is its other face, x the other way
 * round and up turned over, as ride.ts sees it. For cutting away what comes between the eye and the strip there
 * (the user, 23 Nov 2026: "Can you also fix the same issue that we faced with camera as the curve overlaps in the
 * view in the [Möbius] strip too?"). */
export function mobiusFrameAt(bend: Bend, y: number): Frame {
  const L = lengthOfBend(bend)
  const round = Math.floor(y / L)
  const f = frameOfBend(bend, 0, y - round * L)
  const k = round % 2 === 0 ? 1 : -1
  return { at: f.at, along: f.along, across: { x: f.across.x * k, y: f.across.y * k, z: f.across.z * k }, up: { x: f.up.x * k, y: f.up.y * k, z: f.up.z * k } }
}

/** A small side view of the whole strip, for showing where the eye is while riding (the user, 23 Nov 2026: "Can you
 * also add a small preview where I'm at when I'm riding along?"). The strip's middle line seen from the side, its
 * start on the left as the user drew it: y across the picture, z up. In the picture's own units, its top-left 0, 0. */
export interface SideView {
  /** The line, as an SVG path. */
  readonly line: string
  /** How wide and tall the picture is. */
  readonly width: number
  readonly height: number
  /** Where the place y along the strip is in the picture. */
  place(y: number): { readonly x: number; readonly y: number }
}

const sides = new WeakMap<Strip, SideView>()

/** The side view of `strip` (the same each time for the same strip). MY PICK: the line walked every 10 m. */
export function sideOf(strip: Strip): SideView {
  const known = sides.get(strip)
  if (known) return known
  const points: Array<{ y: number; z: number }> = []
  for (let y = 0; y < strip.long; y += 10) { const a = strip.frame(0, y).at; points.push({ y: a.y, z: a.z }) }
  const end = strip.frame(0, strip.long).at
  points.push({ y: end.y, z: end.z })
  const [lowY, highY] = [Math.min(...points.map(p => p.y)), Math.max(...points.map(p => p.y))]
  const [lowZ, highZ] = [Math.min(...points.map(p => p.z)), Math.max(...points.map(p => p.z))]
  const margin = (highY - lowY) / 30
  const toPicture = (y: number, z: number) => ({ x: y - lowY + margin, y: highZ - z + margin })
  const line = points.map((p, i) => { const q = toPicture(p.y, p.z); return `${i ? 'L' : 'M'}${q.x.toFixed(1)} ${q.y.toFixed(1)}` }).join(' ')
  const side: SideView = {
    line,
    width: highY - lowY + 2 * margin,
    height: highZ - lowZ + 2 * margin,
    place(y) { const a = strip.frame(0, Math.min(Math.max(y, 0), strip.long)).at; return toPicture(a.y, a.z) },
  }
  sides.set(strip, side)
  return side
}
