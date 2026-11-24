// THE INTRO OF THE WORLD (23 Nov 2026). The user: "the motion that I have in my mind for the logo is to reveal like a
// single stroke painting with lime, our primary color, and then after few seconds we want to transition into
// blueprint drawing by quick render of secondary colour (violet) outline of the stroke and the lime should
// disappear. Then the wave and circular twist base platform should start building row by row behind the stroke. As
// it builds, the camera should move from the front to the top right and towards the beginning of the platform from
// the back."
//
// THE EYE'S MOVE, CHANGED BY THE USER the same day, on seeing the first one (it went round the platform keeping it
// in the middle of an empty picture): "The camera should go from street to right, up, and then behind the logo, and
// then to the front. Right now it feels like the logo is rotating for the camera. So what we can do is we can have a
// base with a violet line, so that we will have a reference to the base." So there is a BASE now, the ground under
// the platform, drawn in lines of the secondary colour: it stays still, and the eye is seen to move over it.
//
// THE ASTROIDS GLOW, at the user's word on seeing that (the row being laid then showed as a violet line across the
// platform): "while the tiles are being revealed ... not the violet color line rendering each tile, but the
// asteroids between the tiles should glow when they render, and they have to keep glowing till the camera reaches
// the end, and then they should go back to their normal state." And then: "Since we added glow animation for the
// asteroids, it should be a state, right?" So the glow is THE ASTROID'S OWN STATE, Active (@noi/eio-3d, astroid/):
// Eidos says how an astroid glows, and its drawing shows it. The intro only says WHEN: the astroids are active
// from the moment they are laid, and go back to Default when the eye has arrived, in the time Eidos gives every
// change of state. One thing more is the intro's own, part of the building: an astroid that has just been laid
// is brighter for a moment.
//
// So, in order:
//   1 the logo's stroke is painted in the primary colour, from its left tip to its right tip (logoStroke.ts);
//   2 it stays for a moment;
//   3 the stroke's outline is drawn quickly in the secondary colour, and the lime goes; then the base is drawn
//     under it: from the logo's eye, at street level, the base is seen from its edge, as one line under the logo;
//   4 the wave platform is built row by row from its beginning, behind that outline, as three.js draws it
//     (@noi/eio-3d): the same tiles and astroids the world has, in the world's own light; each astroid glows from
//     when it is laid, most where the building is, and goes on glowing;
//   5 while it builds, the eye leaves the front (the logo's eye, logoView.ts): it goes to the right along the
//     ground, round the platform's end; it rises; it comes behind the logo, over the platform's right side; and
//     then it goes forward to the beginning of the platform, to where the world's own eye stands there, looking
//     back at the beginning from further along (land.ts, the isometric view). It stays upright all the way, and
//     it looks at one place of the world (the platform's middle, then its beginning), as a camera carried round
//     a thing does;
//   6 when the eye has arrived, the astroids stop glowing: the platform is as the world shows it. Where the intro
//     opens the world (WorldOpens.tsx), the world itself is then shown in its place.
//
// THE STROKE AND ITS OUTLINE ARE THE VECTOR ITSELF, drawn by the page (SVG) over the world's picture, so the logo
// shows at once, while three.js and the platform are still loading: the intro is also the loading. The platform
// and the base are drawn by three.js alone. All are placed by the same eye, so the outline stays on the platform
// as the eye moves.
//
// THE STROKE IS A DRAWING AND THE PLATFORM IS A STRIP, so the two do not lie exactly on each other from any eye
// (logoView.ts). When the building starts, the outline therefore moves from the drawn stroke's edges onto the
// platform's own two edges, and stays there in front of the platform until the eye has nearly arrived.
//
// MY PICKS, not the user's word: every time below; that the outline settles onto the platform's edges and goes as
// the eye arrives, and that the base goes then too (the world has no such base); the base's size and its lines
// every hundred metres; that an astroid just laid is brighter, by how much and for how long; how large the logo
// is in the window; how far the eye stands back as it goes round; how far off it stands at the end so that it
// sees as the world's eye does.
import { ASTROID, ASTROID_STATES, WAVE, WAVE_PLATFORM, light, makeMany, value, waveFrame, type Made, type WorldElement, type Xyz } from '@noi/eio-3d'
import type { Color, InstancedMesh, Object3D, PerspectiveCamera } from 'three/webgpu'
import { isometricOver, pictureHolds, startOfLand } from '../land.ts'
import { at } from '../place.ts'
import { openWorld, type World } from '../world.ts'
import { LOGO_PATH, LOGO_SIZE, STROKE, edgesOf, type Dot } from './logoStroke.ts'
import { LOGO_EYE, STRIP, alongStrip, crossed, drawnAt, logoEye, lowEdgeIsOne, onStrip, type PictureEye, type V3 } from './logoView.ts'

/** When each part of the intro begins and how long it takes, in seconds. */
export const TIMES = {
  /** The dark before the stroke begins. */
  dark: 0.4,
  /** The stroke is painted. */
  paint: 2.6,
  /** The painted logo stays ("after few seconds"). */
  stay: 2.2,
  /** The outline is drawn: quick. */
  outline: 0.7,
  /** The lime goes, beginning a little after the outline does. */
  limeGoesAfter: 0.15,
  limeGoes: 0.6,
  /** The base is drawn under the logo, beginning so long after the outline does. */
  baseAfter: 0.45,
  base: 0.6,
  /** The outline and the base alone, after the outline is whole and before the building starts. */
  blueprint: 0.6,
  /** The outline settles onto the platform's own edges, as the building starts. */
  settle: 1.3,
  /** The platform is built, row by row. */
  build: 5.2,
  /** The eye goes round, beginning with the building: to the right along the ground, round the platform's end,
   * and behind the logo. */
  round: 6.2,
  /** It turns to look at the platform's middle, over so long from the start of its move. */
  look: 2.8,
  /** It rises: a little after it has begun to go right. */
  riseAfter: 0.3,
  rise: 5.9,
  /** Then it goes forward to the beginning of the platform: it starts while it is still going round, so the move
   * never stops, and so long after the building began. */
  forwardAfter: 4.2,
  forward: 4.4,
  /** When the eye has arrived, the astroids go back to their normal state: in the time Eidos gives every change
   * of state. */
  glowGoes: value('noi.eio.world.states.change'),
} as const

const painted = TIMES.dark + TIMES.paint
const outlined = painted + TIMES.stay
/** When the base begins to be drawn. Three.js draws it, so from here on the intro needs the world open. */
export const BASE_FROM = outlined + TIMES.baseAfter
/** When the building, and the eye's move, begin. */
export const BUILDING_FROM = outlined + TIMES.outline + TIMES.blueprint
/** When the eye has arrived where the world's eye stands. */
export const ARRIVED = BUILDING_FROM + Math.max(TIMES.round, TIMES.riseAfter + TIMES.rise, TIMES.forwardAfter + TIMES.forward)
/** How long the whole intro is: the astroids glow until the eye has arrived, and then stop. */
export const TOTAL = Math.max(BUILDING_FROM + TIMES.build, ARRIVED) + TIMES.glowGoes

/** How much of the window's width the logo takes, and at most how much of its height. */
const LOGO_IN_WINDOW = { width: 0.61, height: 0.5 } as const

/** THE BASE: the ground under the platform. It reaches so far beyond the platform each way (and then to the next
 * whole line), has a line every so many metres, and lies so far under the platform's lowest place. Its inner
 * lines show so much fainter than the line round it. All in metres but the last, a share. */
export const BASE = { beyond: 100, every: 100, under: 1, inner: 0.34 } as const

/** How far from what it turns round the eye stands when it has come behind the logo, in metres: far enough to
 * see the whole base. */
const STANDS_BACK = 3200

/** When the eye has come behind the logo, how much of the window's width and height the base and the platform
 * may fill. */
const MAY_FILL = { width: 0.76, height: 0.74 } as const

/** How far off the eye stands at the end, in metres: so far that it sees a thing as large far as near, as the
 * world's own eye does. */
const FAR_OFF = 30000

/** The share of the eye's way forward over which the outline goes, and over which the base goes. */
const OUTLINE_GOES = { from: 0.3, over: 0.45 } as const
const BASE_GOES = { from: 0.5, over: 0.45 } as const

/** AN ASTROID THAT HAS JUST BEEN LAID IS BRIGHTER FOR A MOMENT: the soft light round it (the astroid's own, of its
 * Active state) is stronger by so much (`bright`, a share of the astroid's colour, at the light's middle). That
 * fades over about so many metres of building behind the row being laid (`over`), and within so many seconds
 * once the building is done (`goes`). */
export const JUST_LAID = { bright: 0.5, over: 50, goes: 0.8 } as const

/** The intro is taken to have been shown at another moment altogether, not moved on, when its time changes by
 * more than this between two pictures, in seconds. */
const JUMP = 0.25

/** Nothing nearer the eye than this is drawn, in metres: so that what is far is still drawn finely in depth. */
const NEAREST = 20

const share = (t: number, from: number, long: number) => Math.min(Math.max((t - from) / long, 0), 1)
/** Slow, fast, slow. */
const eased = (s: number) => (s < 0.5 ? 4 * s * s * s : 1 - (-2 * s + 2) ** 3 / 2)
/** Slow, fast, slow, but gentler: it is soon under way. */
const easedGently = (s: number) => (1 - Math.cos(Math.PI * s)) / 2
/** Fast, then slow. */
const easedOut = (s: number) => 1 - (1 - s) ** 3
/** As a hand paints one stroke: it starts and ends gently, and is quick between. */
const hand = (s: number) => 0.35 * s + 0.65 * eased(s)
/** Slow at first, so the first rows are seen one by one; then even; slow at the end. */
const rowByRow = (s: number) => 0.5 * s + 0.5 * eased(s)

const minus3 = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot3 = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross3 = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit3 = (a: V3): V3 => { const long = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / long, a[1] / long, a[2] / long] }
/** Between two numbers that are both more than 0: evenly by how many times, not by how much. */
const grown = (a: number, b: number, s: number) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * s)
/** A way one long, turned `s` of the angle from `a` toward `b`. */
function turned(a: V3, b: V3, s: number): V3 {
  const angle = Math.acos(Math.min(Math.max(dot3(a, b), -1), 1))
  if (angle < 1e-6) return b
  const [p, q] = [Math.sin((1 - s) * angle) / Math.sin(angle), Math.sin(s * angle) / Math.sin(angle)]
  return unit3([a[0] * p + b[0] * q, a[1] * p + b[1] * q, a[2] * p + b[2] * q])
}

/** The three ways of an upright eye that looks along `looks` (one long, in three.js's order). */
function waysToward(looks: V3): Pick<PictureEye, 'right' | 'top' | 'looks'> {
  const right = unit3(cross3(looks, [0, 1, 0]))
  return { looks, right, top: cross3(right, looks) }
}

/** How far the base reaches each way from the middle of the platform's own base, in metres: to the next whole
 * line beyond the platform. */
export function baseReach(): { readonly x: number; readonly y: number } {
  const to = (half: number) => Math.ceil((half + BASE.beyond) / BASE.every) * BASE.every
  return { x: to(WAVE_PLATFORM.size.x / 2), y: to(WAVE_PLATFORM.size.y / 2) }
}

/** What the page gives the intro to draw into. */
export interface IntroParts {
  /** What holds the picture: the intro is as large as it is. */
  readonly host: HTMLElement
  /** Where three.js draws the platform. */
  readonly canvas: HTMLCanvasElement
  /** What holds the logo in its own units: the intro places it and sizes it. */
  readonly logo: SVGGElement
  /** The painted stroke, inside `logo`. */
  readonly lime: SVGPathElement
  /** The outline, in the window's own dots. */
  readonly outline: SVGPathElement
}

export interface IntroLook {
  /** The colour behind everything, as the page's style gives it. */
  readonly background: string
  /** A colour of Eidos, by its token's name, as the page's style gives it. */
  colour(token: string): string
  /** The token of the secondary colour: the base's lines show in it. */
  readonly secondary: string
}

/** The running intro. */
export interface Intro {
  /** How long it is, in seconds. */
  readonly total: number
  /** Where it is now, in seconds from its start. */
  readonly time: number
  readonly playing: boolean
  /** The open three.js world, once it has opened. */
  readonly world: World | null
  /** Whether the platform and the base are ready to be shown. */
  readonly ready: boolean
  /** Where the eye is now and how it sees: for checks. */
  readonly eye: PictureEye
  /** Shows it as it is at this many seconds, and stays there. */
  seek(seconds: number): void
  play(): void
  pause(): void
  /** Calls `fn` once, when the eye has arrived where the world's eye stands (the astroids still glow). */
  arrived(fn: () => void): void
  /** Calls `fn` once, when it has run to its end. */
  ended(fn: () => void): void
  close(): void
}

const round = (n: number) => Math.round(n * 10) / 10

/** The stroke painted as far as `to` of its places (a count, not whole), as an SVG path in the logo's units: its
 * two edges to there, and a round tip where the brush is. */
function paintedTo(to: number, edges: { readonly one: readonly Dot[]; readonly other: readonly Dot[] }): string {
  const last = STROKE.length - 1
  const k = Math.min(Math.floor(to), last - 1)
  const f = Math.min(to - k, 1)
  const between = (a: Dot, b: Dot): Dot => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  const [one, other] = [between(edges.one[k]!, edges.one[k + 1]!), between(edges.other[k]!, edges.other[k + 1]!)]
  const [p, q] = [STROKE[k]!, STROKE[k + 1]!]
  const middle: Dot = [p.x + (q.x - p.x) * f, p.y + (q.y - p.y) * f]
  const half = p.half + (q.half - p.half) * f
  const long = Math.hypot(q.x - p.x, q.y - p.y) || 1
  const on: Dot = [((q.x - p.x) / long) * half, ((q.y - p.y) / long) * half]
  const out: string[] = []
  for (let i = 0; i <= k; i++) out.push(`${i ? 'L' : 'M'}${round(edges.one[i]![0])} ${round(edges.one[i]![1])}`)
  // round the brush's tip: from one edge, on past the middle, to the other edge
  for (let s = 0; s <= 8; s++) {
    const a = (s / 8) * Math.PI
    out.push(`L${round(middle[0] + Math.cos(a) * (one[0] - middle[0]) + Math.sin(a) * on[0])} ${round(middle[1] + Math.cos(a) * (one[1] - middle[1]) + Math.sin(a) * on[1])}`)
  }
  out.push(`L${round(other[0])} ${round(other[1])}`)
  for (let i = k; i >= 0; i--) out.push(`L${round(edges.other[i]![0])} ${round(edges.other[i]![1])}`)
  return `${out.join('')}Z`
}

/** Plays the intro into `parts`. It begins at once; three.js and the platform load while the stroke is painted. */
export function playIntro(parts: IntroParts, look: IntroLook, onError?: (why: unknown) => void): Intro {
  const { host, canvas, logo, lime, outline } = parts
  const edges = edgesOf()
  // for each place of the stroke: the place along the strip behind it, and there the strip's two edges
  const along = alongStrip()
  const straight = lowEdgeIsOne(along)
  const stripOne = along.map(y => onStrip(straight ? -STRIP.half : STRIP.half, y))
  const stripOther = along.map(y => onStrip(straight ? STRIP.half : -STRIP.half, y))
  // places along the strip's middle and the base's four corners: what must lie before the eye and behind it
  const reach = baseReach()
  const corners: V3[] = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => crossed({ x: sx! * reach.x, y: sy! * reach.y, z: 0 - BASE.under }))
  const spine: V3[] = Array.from({ length: 61 }, (_, i) => onStrip(0, (i / 60) * STRIP.long))
  // THE TWO PLACES THE EYE LOOKS AT: first the middle of the platform, a third of its height up; at the end the
  // beginning of the platform
  const middle: Xyz = { x: 0, y: 0, z: WAVE_PLATFORM.size.z / 3 }
  const start = waveFrame(WAVE, 0, 0)
  const beginning: Xyz = start.at
  // the world's own eye over the beginning: as far back along the strip's across, along and up as the land's is
  const view = isometricOver(at(0, 0))
  const back = { x: view.from.x - view.at.x, y: view.from.y - view.at.y, z: view.from.z - view.at.z }
  const awayAtEnd = unit3([
    start.across.x * back.x + start.along.x * back.y + start.up.x * back.z,
    start.across.y * back.x + start.along.y * back.y + start.up.y * back.z,
    start.across.z * back.x + start.along.z * back.y + start.up.z * back.z,
  ])
  // which way round the platform the world's eye stands (an angle in the ground), and how steeply it looks down
  const [roundAtEnd, steepAtEnd] = [Math.atan2(awayAtEnd[1], awayAtEnd[0]), Math.asin(awayAtEnd[2])]
  // and the logo's eye, said the same way from the platform's middle: which way round, how far, how high
  const fromMiddle = { x: LOGO_EYE.from.x - middle.x, y: LOGO_EYE.from.y - middle.y, z: LOGO_EYE.from.z - middle.z }
  const roundAtFirst = Math.atan2(fromMiddle.y, fromMiddle.x)
  const farAtFirst = Math.hypot(fromMiddle.x, fromMiddle.y, fromMiddle.z)
  // how many metres the base and the platform take in the picture of an eye that looks as the world's does, from
  // far off: across the picture and up it
  const whole = (() => {
    const ways = waysToward(crossed({ x: 0 - awayAtEnd[0], y: 0 - awayAtEnd[1], z: 0 - awayAtEnd[2] }))
    let [left, low, right, high] = [Infinity, Infinity, -Infinity, -Infinity]
    for (const p of [...corners, ...spine]) {
      const [x, y] = [dot3(p, ways.right), dot3(p, ways.top)]
      left = Math.min(left, x); right = Math.max(right, x); low = Math.min(low, y); high = Math.max(high, y)
    }
    return { wide: right - left, tall: high - low }
  })()
  const land = startOfLand()

  let world: World | null = null
  let built: Built | null = null
  let building = false
  let closed = false
  let [time, playing, last] = [0, true, performance.now()]
  let atArrival: (() => void) | null = null
  let atEnd: (() => void) | null = null
  let shownPaint = ''
  let shownOutline = ''
  let frame = 0

  const close = () => {
    if (closed) return
    closed = true
    cancelAnimationFrame(frame)
    built?.gone()
    world?.close()
  }
  const fail = (why: unknown) => {
    if (closed) return
    close()
    console.error(why)
    onError?.(why)
  }

  const size = () => ({ width: host.clientWidth || 1, height: host.clientHeight || 1 })
  /** How large the logo is drawn in the window, and where its left and top edge are. */
  const logoIn = (width: number, height: number) => {
    const scale = Math.min((width * LOGO_IN_WINDOW.width) / LOGO_SIZE.width, (height * LOGO_IN_WINDOW.height) / LOGO_SIZE.height)
    return { scale, left: (width - LOGO_SIZE.width * scale) / 2, top: (height - LOGO_SIZE.height * scale) / 2 }
  }

  /** THE EYE ON ITS WAY. `gone`: how much of its way round it has gone (0: where the logo's eye stands, at the
   * front; 1: behind the logo, over the platform's right side, where the world's eye stands from). `risen`: how
   * much of its rise it has made (0: at street level; 1: as high as the world's eye). `looking`: how far it has
   * turned from looking level, as the logo's eye does, to looking at the platform's middle. `forward`: how much of
   * its way forward it has gone (0: it looks at the platform's middle, the whole base in its picture; 1: it is
   * the world's eye over the beginning of the platform). All are shares, 0 to 1. */
  const eyeAt = (gone: number, risen: number, looking: number, forward: number, width: number, height: number): PictureEye => {
    const placed = logoIn(width, height)
    const first = logoEye(placed.scale, placed.left, placed.top, width, height)
    if (gone <= 0 && risen <= 0 && looking <= 0 && forward <= 0) return first
    // what it turns round and looks at: the platform's middle, then the platform's beginning
    const kept: Xyz = { x: middle.x + (beginning.x - middle.x) * forward, y: middle.y + (beginning.y - middle.y) * forward, z: middle.z + (beginning.z - middle.z) * forward }
    // WHERE IT STANDS. Round what it keeps: from the front, to the right, to behind the logo. As far off as the
    // logo's eye at first; it stands back as it goes round, to see the whole base; and going forward it goes ever
    // farther off, so that at the end it sees as the world's eye does. It keeps its height above the ground
    // until it rises.
    const angle = roundAtFirst + (roundAtEnd - roundAtFirst) * gone
    const far = grown(farAtFirst + (STANDS_BACK - farAtFirst) * gone, FAR_OFF, forward)
    const up = fromMiddle.z + (far * Math.sin(steepAtEnd) - fromMiddle.z) * risen
    const out = Math.sqrt(Math.max(far * far - up * up, 1))
    const from = crossed({ x: kept.x + out * Math.cos(angle), y: kept.y + out * Math.sin(angle), z: kept.z + up })
    // WHICH WAY IT FACES: upright always; from the way the logo's eye looks, level, to looking at what it keeps
    const toKept = minus3(crossed(kept), from)
    const ways = waysToward(turned(first.looks, unit3(toKept), looking))
    const before = Math.max(dot3(toKept, ways.looks), far * 0.2)
    // where what it keeps is drawn, for a focal of one
    const keptAt = [dot3(toKept, ways.right) / before, (0 - dot3(toKept, ways.top)) / before] as const
    // HOW LARGE IT DRAWS what it keeps, in dots a metre: as the logo's eye does; then so that the whole base is in
    // the picture; and at the end as the world does (the picture holds so many metres, land.ts)
    const toMiddleFirst = minus3(crossed(middle), first.from)
    const beforeFirst = dot3(toMiddleFirst, first.looks)
    const dotsFirst = first.focal / beforeFirst
    const dotsWhole = Math.min((width * MAY_FILL.width) / whole.wide, (height * MAY_FILL.height) / whole.tall)
    const dotsLast = height / pictureHolds(land, width / height)
    const focal = grown(grown(dotsFirst, dotsWhole, gone), dotsLast, forward) * before
    // WHERE IN THE PICTURE it keeps it: where the logo's eye draws the platform's middle, then the picture's middle
    const middleFirst = [first.shift[0] + (first.focal * dot3(toMiddleFirst, first.right)) / beforeFirst, first.shift[1] - (first.focal * dot3(toMiddleFirst, first.top)) / beforeFirst] as const
    const keptIn = [middleFirst[0] * (1 - looking), middleFirst[1] * (1 - looking)] as const
    return { from, ...ways, focal, shift: [keptIn[0] - focal * keptAt[0], keptIn[1] - focal * keptAt[1]] }
  }

  /** The eye at `t` seconds. */
  const eyeNow = (t: number, width: number, height: number): PictureEye => eyeAt(
    easedGently(share(t, BUILDING_FROM, TIMES.round)),
    eased(share(t, BUILDING_FROM + TIMES.riseAfter, TIMES.rise)),
    eased(share(t, BUILDING_FROM, TIMES.look)),
    eased(share(t, BUILDING_FROM + TIMES.forwardAfter, TIMES.forward)),
    width, height,
  )

  /** Puts three.js's own eye where `eye` is, seeing as it sees. */
  const see = (w: World, eye: PictureEye, width: number, height: number) => {
    const camera = w.camera as PerspectiveCamera
    const THREE = w.three
    camera.position.set(eye.from[0], eye.from[1], eye.from[2])
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(...eye.right), new THREE.Vector3(...eye.top), new THREE.Vector3(0 - eye.looks[0], 0 - eye.looks[1], 0 - eye.looks[2])))
    camera.fov = (2 * Math.atan(height / (2 * eye.focal)) * 180) / Math.PI
    camera.aspect = width / height
    // the middle of its sight is not the middle of the picture: the picture is a window moved over a larger one
    camera.setViewOffset(width, height, 0 - eye.shift[0], 0 - eye.shift[1], width, height)
    // it sees from just before the platform and the base to just behind them
    let [near, far] = [Infinity, 0]
    for (const p of [...spine, ...corners]) { const d = dot3(minus3(p, eye.from), eye.looks); near = Math.min(near, d); far = Math.max(far, d) }
    camera.near = Math.max(near - 2 * STRIP.half, NEAREST)
    camera.far = far + 2 * STRIP.half
    camera.updateProjectionMatrix()
  }

  /** The outline as an SVG path in the window's dots: drawn as far as `drawn` of the stroke (0 to 1) from its left
   * tip along both edges, each dot `settled` of the way from the stroke's edge to the strip's edge behind it. */
  const outlinePath = (drawn: number, settled: number, eye: PictureEye, width: number, height: number): string => {
    const placed = logoIn(width, height)
    const last = STROKE.length - 1
    const to = drawn * last
    const k = Math.min(Math.floor(to), last)
    const dotOf = (edge: readonly Dot[], strip: readonly V3[], i: number): Dot => {
      const flat: Dot = [placed.left + edge[i]![0] * placed.scale, placed.top + edge[i]![1] * placed.scale]
      if (settled <= 0) return flat
      const on = drawnAt(eye, strip[i]!, width, height)
      return [flat[0] + (on[0] - flat[0]) * settled, flat[1] + (on[1] - flat[1]) * settled]
    }
    const end = (edge: readonly Dot[], strip: readonly V3[]): Dot | null => {
      if (k >= last) return null
      const [a, b] = [dotOf(edge, strip, k), dotOf(edge, strip, k + 1)]
      return [a[0] + (b[0] - a[0]) * (to - k), a[1] + (b[1] - a[1]) * (to - k)]
    }
    const out: string[] = []
    const add = (d: Dot | null) => { if (d) out.push(`${out.length ? 'L' : 'M'}${round(d[0])} ${round(d[1])}`) }
    add(end(edges.one, stripOne))
    for (let i = k; i >= 0; i--) add(dotOf(edges.one, stripOne, i))
    for (let i = 0; i <= k; i++) add(dotOf(edges.other, stripOther, i))
    add(end(edges.other, stripOther))
    return out.join('')
  }

  /** Shows the intro as it is at `t` seconds. */
  const show = (t: number) => {
    const { width, height } = size()
    const placed = logoIn(width, height)
    logo.setAttribute('transform', `translate(${round(placed.left)} ${round(placed.top)}) scale(${placed.scale})`)

    // 1 and 2: the stroke is painted, and stays; 3: it goes
    const paint = hand(share(t, TIMES.dark, TIMES.paint))
    const limeLeft = 1 - share(t, outlined + TIMES.limeGoesAfter, TIMES.limeGoes)
    const paintNow = paint <= 0 || limeLeft <= 0 ? '' : paint >= 1 ? LOGO_PATH : paintedTo(paint * (STROKE.length - 1), edges)
    if (paintNow !== shownPaint) { lime.setAttribute('d', paintNow); shownPaint = paintNow }
    lime.style.opacity = String(limeLeft)

    // 3: the outline is drawn; 4 and 5: it settles onto the platform's edges and goes as the eye goes forward
    const eye = eyeNow(t, width, height)
    const forward = eased(share(t, BUILDING_FROM + TIMES.forwardAfter, TIMES.forward))
    const drawn = easedOut(share(t, outlined, TIMES.outline))
    const settled = eased(share(t, BUILDING_FROM, TIMES.settle))
    const outlineLeft = 1 - eased(share(forward, OUTLINE_GOES.from, OUTLINE_GOES.over))
    const outlineNow = drawn <= 0 || outlineLeft <= 0 ? '' : outlinePath(drawn, settled, eye, width, height)
    if (outlineNow !== shownOutline) { outline.setAttribute('d', outlineNow); shownOutline = outlineNow }
    outline.style.opacity = String(outlineLeft)

    if (!world) return
    see(world, eye, width, height)
    // 3: the base is drawn, from the beginning's side to the end's; 5: it goes as the eye arrives
    built?.base(easedOut(share(t, BASE_FROM, TIMES.base)), 1 - eased(share(forward, BASE_GOES.from, BASE_GOES.over)))
    // 4: so many metres of the platform are built, in whole rows; the astroids are active from when they are laid,
    // and brighter where the building is (and for a moment after it is done); 6: when the eye has arrived, they
    // go back to their normal state
    const builtTo = rowByRow(share(t, BUILDING_FROM, TIMES.build)) * STRIP.long
    built?.to(builtTo, t < ARRIVED, builtTo + share(t, BUILDING_FROM + TIMES.build, JUST_LAID.goes) * 4 * JUST_LAID.over, t)
  }

  const step = () => {
    if (closed) return
    const now = performance.now()
    // a picture that came late does not make the intro jump: it goes on from where it was
    const passed = Math.min((now - last) / 1000, 0.05)
    last = now
    if (playing) {
      const was = time
      time = Math.min(time + passed, TOTAL)
      // the base, and all after it, wait for the world
      if (!built && time > BASE_FROM) time = BASE_FROM
      if (was < ARRIVED && time >= ARRIVED) atArrival?.()
      if (was < TOTAL && time >= TOTAL) atEnd?.()
    }
    // the platform is made while the painted logo stays still, so the painting is never held up by it
    if (world && !built && !building && time >= painted) void make(world).catch(fail)
    show(time)
  }

  // until three.js has opened the world, the page's own frames move the intro; then the world's do, so the
  // outline and the platform are drawn for the same moment
  const own = () => { step(); if (!world && !closed) frame = requestAnimationFrame(own) }
  frame = requestAnimationFrame(own)

  const make = async (w: World) => {
    building = true
    const unlit = light(w, look.colour)
    let made: Built | null = null
    try {
      made = await build(w, look)
      if (closed) return
      // the card is given the platform's surfaces before the first row shows, so the building starts smoothly
      const { width, height } = size()
      see(w, eyeAt(0, 0, 0, 0, width, height), width, height)
      await w.renderer.compileAsync(w.scene, w.camera)
      if (closed) return
      const ready = made
      built = { ...ready, gone() { ready.gone(); unlit() } }
      made = null
    } finally {
      made?.gone()
      if (!built) unlit()
    }
  }

  openWorld(canvas, { background: look.background }, 'perspective')
    .then(w => {
      if (closed) { w.close(); return }
      world = w
      cancelAnimationFrame(frame)
      w.eachFrame(step)
    })
    .catch(fail)

  return {
    total: TOTAL,
    get time() { return time },
    get playing() { return playing },
    get world() { return world },
    get ready() { return !!built },
    get eye() { const { width, height } = size(); return eyeNow(time, width, height) },
    seek(seconds) {
      playing = false
      time = Math.min(Math.max(seconds, 0), TOTAL)
      show(time)
    },
    play() {
      if (time >= TOTAL) time = 0
      playing = true
      last = performance.now()
    },
    pause() { playing = false },
    arrived(fn) { atArrival = fn },
    ended(fn) { atEnd = fn },
    close,
  }
}

/** The platform and the base as the intro shows them. */
interface Built {
  /** Shows the platform built as far as `metres` along the strip, in whole rows, at `seconds` of the intro: its
   * astroids `active` or in their normal state (they go over in Eidos's own time), and brighter where they lie
   * just behind `fresh` metres along the strip (where the building is). */
  to(metres: number, active: boolean, fresh: number, seconds: number): void
  /** Shows the base drawn as far as `drawn` of its length (0 to 1) from the beginning's side, as strong as
   * `strength` (0: gone; 1: whole). */
  base(drawn: number, strength: number): void
  gone(): void
}

/** Makes the wave platform so that it can be shown row by row: what the element lays (@noi/eio-3d), each kind of
 * thing on each face drawn as one, its places in the order of the rows; the glow of its astroids; and the base
 * under it, in lines of the secondary colour. */
async function build(world: World, look: IntroLook): Promise<Built> {
  const THREE = world.three
  // three.js's own lines of a width in dots (a plain line is one dot of the card wide, whatever the screen)
  const [{ LineSegments2 }, { LineSegmentsGeometry }] = await Promise.all([import('three/addons/lines/webgpu/LineSegments2.js'), import('three/addons/lines/LineSegmentsGeometry.js')])
  const holder = new THREE.Group()
  holder.name = 'intro platform'
  world.xyz.add(holder)
  const frameOf = (x: number, y: number) => {
    const f = waveFrame(WAVE, x, y)
    return new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.across.x, f.across.y, f.across.z), new THREE.Vector3(f.along.x, f.along.y, f.along.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z),
    ).setPosition(f.at.x, f.at.y, f.at.z)
  }
  // each kind of thing on each face, its places row by row from the beginning
  const kinds = new Map<string, { of: WorldElement; under: boolean; where: Xyz[] }>()
  for (const laid of WAVE_PLATFORM.shape.things) {
    const key = `${laid.element.id} ${laid.under ? 'under' : 'top'}`
    const kind = kinds.get(key) ?? { of: laid.element, under: !!laid.under, where: [] }
    kind.where.push({ x: laid.at.x, y: laid.at.y, z: 0 })
    kinds.set(key, kind)
  }
  const many: Array<{ of: WorldElement; under: boolean; where: Xyz[]; made: Made; meshes: InstancedMesh[]; rows: number[]; inRow: number; deep: number }> = []
  for (const kind of kinds.values()) {
    kind.where.sort((a, b) => a.y - b.y || a.x - b.x)
    const rows = [...new Set(kind.where.map(p => p.y))]
    const made = makeMany(world, kind.of, kind.where, look.colour, kind.under, p => frameOf(p.x, p.y))
    const meshes: InstancedMesh[] = []
    made.thing.traverse((o: Object3D) => { if ((o as InstancedMesh).isInstancedMesh) meshes.push(o as InstancedMesh) })
    for (const mesh of meshes) mesh.count = 0
    holder.add(made.thing)
    many.push({ of: kind.of, under: kind.under, where: kind.where, made, meshes, rows, inRow: kind.where.length / rows.length, deep: kind.of.size.y })
  }
  const [secondary, sky] = [new THREE.Color(look.colour(look.secondary)), new THREE.Color(look.background)]

  // THE ASTROIDS ARE ACTIVE FROM THE MOMENT THEY ARE LAID: their own state, which Eidos's drawing shows (they give
  // off their colour, and a soft light of it lies round each). So they are put in it now, before any is shown.
  const astroids = many.filter(kind => kind.of === ASTROID)
  const states = { active: 'active', normal: 'default' } as const satisfies Record<string, keyof typeof ASTROID_STATES>
  for (const kind of astroids) kind.made.state(states.active, true)
  let [isActive, shownAt] = [true, null as number | null]

  // AN ASTROID JUST LAID IS BRIGHTER (JUST_LAID): one more soft light round each, of the astroid's colour and as
  // large as its own, that adds to it. Each knows how far along the strip its astroid lies, so those just behind
  // the row being laid show, and fade as the building goes on.
  const { uv, float, attribute, uniform, length, smoothstep, exp, max } = world.tsl
  const own = new THREE.Color(look.colour(ASTROID.surface.colour))
  const round = ASTROID_STATES.active.glow?.whole?.round ?? { across: ASTROID.size.x, above: 0 }
  const freshAt = uniform(0)
  const far = length(uv().sub(0.5)).mul(2) // 0 at the light's middle, 1 at its edge
  const soft = float(1).sub(smoothstep(0, 1, far))
  const justLaid = exp(max(freshAt.sub(attribute('along', 'float')), 0).div(0 - JUST_LAID.over))
  const lightSurface = new THREE.MeshBasicNodeMaterial({ color: own, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })
  lightSurface.opacityNode = soft.mul(soft).mul(justLaid).mul(JUST_LAID.bright)
  const lights = astroids.map(kind => {
    const shape = new THREE.PlaneGeometry(1, 1)
    shape.setAttribute('along', new THREE.InstancedBufferAttribute(new Float32Array(kind.where.map(p => p.y)), 1))
    const mesh = new THREE.InstancedMesh(shape, lightSurface, kind.where.length)
    mesh.name = `intro just laid ${kind.under ? 'under' : 'top'}`
    const lift = new THREE.Matrix4().makeTranslation(0, 0, kind.of.size.z + round.above).multiply(new THREE.Matrix4().makeScale(round.across, round.across, 1))
    const over = new THREE.Matrix4().makeRotationY(Math.PI)
    kind.where.forEach((p, i) => {
      // on the astroid's place, turned as the strip is there; on the face below, turned over as the astroid is
      const put = frameOf(p.x, p.y)
      if (kind.under) put.multiply(over)
      mesh.setMatrixAt(i, put.multiply(lift))
    })
    mesh.instanceMatrix.needsUpdate = true
    mesh.computeBoundingSphere()
    mesh.count = 0
    holder.add(mesh)
    return { mesh, shape, kind }
  })

  // THE BASE: a line round it, and a line every so many metres both ways, a little under the platform. Each is one
  // dot of the page wide, however far off (as the outline is). A fainter line is nearer the sky's colour: these
  // lines of three.js do not let what is behind them through.
  const reach = baseReach()
  const z = 0 - BASE.under
  const [edge, inner]: [number[], number[]] = [[], []]
  edge.push(0 - reach.x, 0 - reach.y, z, reach.x, 0 - reach.y, z, reach.x, 0 - reach.y, z, reach.x, reach.y, z, reach.x, reach.y, z, 0 - reach.x, reach.y, z, 0 - reach.x, reach.y, z, 0 - reach.x, 0 - reach.y, z)
  for (let x = BASE.every - reach.x; x < reach.x; x += BASE.every) inner.push(x, 0 - reach.y, z, x, reach.y, z)
  for (let y = BASE.every - reach.y; y < reach.y; y += BASE.every) inner.push(0 - reach.x, y, z, reach.x, y, z)
  const base = new THREE.Group()
  base.name = 'intro base'
  base.visible = false
  holder.add(base)
  const lines = [{ dots: edge, strength: 1 }, { dots: inner, strength: BASE.inner }].map(({ dots, strength }) => {
    const shape = new LineSegmentsGeometry().setPositions(dots)
    // seen from both sides: the stage's `xyz` is a mirror (world.ts), and three.js would take these lines, which
    // it makes facing the eye, for facing away
    const surface = new THREE.Line2NodeMaterial({ color: secondary.clone(), linewidth: 1, side: THREE.DoubleSide })
    base.add(new LineSegments2(shape, surface))
    return { shape, surface, strength }
  })

  return {
    to(metres, active, fresh, seconds) {
      for (const kind of many) {
        // a row shows once the building has reached its far side
        let shown = 0
        while (shown < kind.rows.length && kind.rows[shown]! + kind.deep / 2 <= metres + 1e-6) shown++
        for (const mesh of kind.meshes) mesh.count = shown * kind.inRow
        // and with each astroid, the light of its having just been laid, while any still shows
        for (const lit of lights) if (lit.kind === kind) { lit.mesh.count = shown * kind.inRow; lit.mesh.visible = shown > 0 && fresh - metres < 4 * JUST_LAID.over }
      }
      freshAt.value = fresh
      // the astroids' state: they go over as Eidos's drawing has them, moved on by the intro's own time; when the
      // intro is shown at another moment altogether (a check that steps through it), they are there at once
      const jumped = shownAt === null || Math.abs(seconds - shownAt) > JUMP
      shownAt = seconds
      if (active !== isActive) {
        isActive = active
        for (const kind of astroids) kind.made.state(active ? states.active : states.normal, jumped)
      }
      for (const kind of astroids) kind.made.step?.(seconds)
    },
    base(drawn, strength) {
      base.visible = drawn > 0.001 && strength > 0.001
      if (!base.visible) return
      // drawn from the beginning's side: it is as long as it is drawn, its low-y end staying where it is
      base.scale.y = drawn
      base.position.y = (0 - reach.y) * (1 - drawn)
      for (const line of lines) (line.surface.color as Color).copy(sky).lerp(secondary, line.strength * strength)
    },
    gone() {
      holder.removeFromParent()
      for (const kind of many) kind.made.gone()
      for (const lit of lights) { lit.mesh.dispose(); lit.shape.dispose() }
      lightSurface.dispose()
      for (const line of lines) { line.shape.dispose(); line.surface.dispose() }
    },
  }
}
