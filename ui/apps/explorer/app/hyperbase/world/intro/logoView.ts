// WHERE THE PLATFORM LIES BEHIND THE LOGO'S STROKE (23 Nov 2026). The logo is the wave platform seen from the
// front (the user, 23 Nov: "I want this angle to be our logo"), then drawn again by the user as one smooth stroke.
// The intro shows the stroke first and then builds the platform "behind the stroke", so the picture needs an eye
// from which the real platform lies behind the drawn one.
//
// No eye sees the platform exactly as the stroke is drawn: the stroke is a drawing, evenly wide and smooth, and the
// platform is a flat strip that turns its faces. So LOGO_EYE is the nearest eye OF THE KIND THE USER ASKED FOR.
// The user, of the eye's move: "The camera should go from street to right, up, and then behind the logo, and then
// to the front", with "a base with a violet line, so that we will have a reference to the base". So the eye starts
// at street level, held level (it looks along the ground, as a camera with a shifted lens does), where the base
// under the platform is seen from its edge, as one line under the logo, and far enough back that the line ends
// inside the picture on both sides. From there the platform's middle line lies about 25 of the logo's units from
// the stroke's on average, the logo being 922 wide. (An eye free to stand anywhere came to 10, but only from under
// the ground, looking up: from there a base is seen from below.)
//
// Nothing here knows three.js: an eye is plain numbers, so the stroke can be shown before three.js has loaded.
// MY PICKS, not the user's word: the eye itself (found by search), and how the stroke's places are matched to
// places along the strip.
import { WAVE, waveFrame, waveLength, type Xyz } from '@noi/eio-3d'
import { at, toThree } from '../place.ts'
import { STROKE, edgesOf, type Dot } from './logoStroke.ts'

/** Three numbers in three.js's own order. */
export type V3 = readonly [number, number, number]

const minus = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: V3): V3 => { const long = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / long, a[1] / long, a[2] / long] }

/** A place of the user's, in three.js's order (by the one crossing, place.ts). */
export const crossed = (p: Xyz): V3 => toThree(at(p.x, p.y, p.z))

/** An eye that makes a picture: where it stands, its own three ways, how large it draws, and where the middle of
 * its sight falls in the picture. */
export interface PictureEye {
  /** Where it stands, in three.js's order. */
  readonly from: V3
  /** Its right hand, what is up in its picture, and the way it looks, each one long, in three.js's order. */
  readonly right: V3
  readonly top: V3
  readonly looks: V3
  /** How many dots a thing one metre across is drawn, when it is one metre before the eye. */
  readonly focal: number
  /** Where the middle of its sight falls, in dots from the middle of the picture: to the right, and down. */
  readonly shift: readonly [number, number]
}

/** The three ways of an eye that stands at `from` and looks toward `toward`, upright. */
export function waysOf(from: V3, toward: V3): Pick<PictureEye, 'right' | 'top' | 'looks'> {
  const looks = unit(minus(toward, from))
  const right = unit(cross(looks, [0, 1, 0]))
  return { looks, right, top: cross(right, looks) }
}

/** Where a place is drawn in a picture `width` by `height` dots: dots from its left and its top, and how far
 * before the eye the place is, in metres. */
export function drawnAt(eye: PictureEye, place: V3, width: number, height: number): readonly [number, number, number] {
  const d = minus(place, eye.from)
  const far = dot(d, eye.looks)
  return [width / 2 + eye.shift[0] + (eye.focal * dot(d, eye.right)) / far, height / 2 + eye.shift[1] - (eye.focal * dot(d, eye.top)) / far, far]
}

/** THE EYE OF THE LOGO: where it stands and what it looks toward, in the user's x, y, z (a little over a metre
 * above the ground, looking level); how many of the logo's units a slope of one is drawn; and where the middle of
 * its sight falls, in the logo's units (on the logo's foot, so the ground's line is drawn there). */
export const LOGO_EYE = {
  from: { x: -1660.7, y: 978.17, z: 1.43 },
  toward: { x: -868.32, y: 368.14, z: 1.43 },
  focal: 994.09,
  middle: [277.22, 318.09],
} as const

/** The logo's eye for a picture `width` by `height` dots in which the logo is drawn `scale` times its own units,
 * its left and top edge at `left` and `top`. */
export function logoEye(scale: number, left: number, top: number, width: number, height: number): PictureEye {
  const from = crossed(LOGO_EYE.from)
  return {
    from,
    ...waysOf(from, crossed(LOGO_EYE.toward)),
    focal: LOGO_EYE.focal * scale,
    shift: [left + LOGO_EYE.middle[0] * scale - width / 2, top + LOGO_EYE.middle[1] * scale - height / 2],
  }
}

/** The strip's own numbers: how long it is, and half its width. */
export const STRIP = { long: waveLength(WAVE), half: WAVE.across / 2 } as const

/** A place of the strip (its own x across and y along), in three.js's order. */
export const onStrip = (x: number, y: number): V3 => crossed(waveFrame(WAVE, x, y).at)

/** How finely the strip is walked to match it to the stroke, in metres. */
const WALK = 5

/** FOR EACH PLACE OF THE STROKE, THE PLACE ALONG THE STRIP THAT LIES BEHIND IT: how many metres along the strip.
 * Both run from one end to the other, so they are matched in order (each place of one to the nearest of the
 * other that keeps the order), the two ends to the two ends. */
export function alongStrip(): readonly number[] {
  const eye = logoEye(1, 0, 0, 0, 0)
  const rows = Math.round(STRIP.long / WALK)
  const strip: Dot[] = Array.from({ length: rows + 1 }, (_, j) => { const p = drawnAt(eye, onStrip(0, (j / rows) * STRIP.long), 0, 0); return [p[0], p[1]] })
  const [n, m] = [STROKE.length, strip.length]
  // the least sum of gaps that brings the first i places of the stroke to the first j of the strip
  const sum = new Float64Array(n * m)
  const gap = (i: number, j: number) => Math.hypot(STROKE[i]!.x - strip[j]![0], STROKE[i]!.y - strip[j]![1])
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    const before = i === 0 && j === 0 ? 0 : Math.min(i > 0 ? sum[(i - 1) * m + j]! : Infinity, j > 0 ? sum[i * m + j - 1]! : Infinity, i > 0 && j > 0 ? sum[(i - 1) * m + j - 1]! : Infinity)
    sum[i * m + j] = before + gap(i, j)
  }
  // back along the least way: every place of the strip a place of the stroke was brought to
  const met: number[][] = Array.from({ length: n }, () => [])
  let [i, j] = [n - 1, m - 1]
  for (;;) {
    met[i]!.push(j)
    if (i === 0 && j === 0) break
    const [up, left, both] = [i > 0 ? sum[(i - 1) * m + j]! : Infinity, j > 0 ? sum[i * m + j - 1]! : Infinity, i > 0 && j > 0 ? sum[(i - 1) * m + j - 1]! : Infinity]
    if (both <= up && both <= left) { i--; j-- } else if (up <= left) i--; else j--
  }
  const raw = met.map(js => (js.reduce((s, v) => s + v, 0) / js.length / rows) * STRIP.long)
  // evened out a little, never going back, and the two ends on the two ends
  const even = raw.map((_, k) => { let [s, c] = [0, 0]; for (let q = Math.max(k - 6, 0); q <= Math.min(k + 6, n - 1); q++) { s += raw[q]!; c++ } return s / c })
  for (let k = 1; k < n; k++) even[k] = Math.max(even[k]!, even[k - 1]!)
  even[0] = 0
  even[n - 1] = STRIP.long
  return even
}

/** Which edge of the strip lies behind which edge of the stroke: true when the strip's low-x edge lies behind
 * the stroke's first edge (edgesOf's `one`), false when behind its other. The nearer of the two ways. */
export function lowEdgeIsOne(along: readonly number[]): boolean {
  const eye = logoEye(1, 0, 0, 0, 0)
  const { one, other } = edgesOf()
  let [straight, swapped] = [0, 0]
  along.forEach((y, k) => {
    const [low, high] = [drawnAt(eye, onStrip(-STRIP.half, y), 0, 0), drawnAt(eye, onStrip(STRIP.half, y), 0, 0)]
    const far = (a: Dot, b: readonly number[]) => (a[0] - b[0]!) ** 2 + (a[1] - b[1]!) ** 2
    straight += far(one[k]!, low) + far(other[k]!, high)
    swapped += far(one[k]!, high) + far(other[k]!, low)
  })
  return straight <= swapped
}
