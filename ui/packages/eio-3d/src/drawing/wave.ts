// A FLAT STRIP LAID AS A WAVE AND A CIRCULAR TWIST (23 Nov 2026, issue 130).
// The user drew it in 2D, seen from the side, with two parts named "Wave" and "Circular twist": "the leftmost part
// of the image is the starting point, and basically it starts with a wave that goes up and then down, and then it
// becomes a spiral." And: "we should always keep the tiles the way they are. Do not squeeze or reshape them."
//
// How the tiles stay whole: the strip is only ever bent along its length, as a sheet of paper is curled, never
// stretched. Seen from the side, its middle follows the drawn line (its runs: wave-platform/). So that the twist
// can pass beside itself instead of through itself, the whole strip is laid a little aslant across that curled
// sheet (its slant). A sheet curled this way can be unrolled flat again with nothing stretched, so every tile keeps
// its square.
//
// A thing is laid on the strip by its own x (across, from minus half the strip to half of it), y (along the
// strip, from 0 where it begins) and z (up from the strip, so a tile on the face below hangs from z 0 down).
//
// The strip's own numbers are the wave platform's (wave-platform/). How finely the eased line is walked (half a
// metre at a time) is this file's precision; its reach is found at the corners of its tiles.
import { value } from './eidos.ts'
import type { Frame, Xyz } from './space.ts'

/** One run of the strip as seen from the side: how long it is, and how far it curves round over that length. */
export interface Run {
  /** Its length along the strip's middle, in metres. */
  readonly long: number
  /** How far it curves round, in degrees: more than 0 curves upward, less than 0 curves downward. */
  readonly turn: number
  /** What it is, in words. */
  readonly says: string
}

/** How a flat strip is laid as a wave and a circular twist. */
export interface Wave {
  readonly kind: 'wave'
  /** The flat start, as today's world. */
  readonly runway: number
  /** The runs after it, in the order y runs. */
  readonly runs: readonly Run[]
  /** The flat end, after the last run. */
  readonly end: number
  /** How wide the strip is (its x runs from minus half of this to half of it). */
  readonly across: number
  /** How far aslant the strip is laid across the curled sheet, in degrees, so the twist passes beside itself: less
   * than 0 moves it toward low x as it goes round, more than 0 toward high x. */
  readonly slant: number
  /** Over how many metres each change of curve is eased in, so the line never bends sharply from one run to the
   * next (0: it changes at once, as runs of steady curve meet). */
  readonly ease?: number
}

const deg = Math.PI / 180

/** A base tile's breadth and width: the strip is laid in whole rows of tiles, and its reach is found at their
 * corners. */
const ROW = () => value('noi.eio.world.base-tile.breadth')
const COLUMN = () => value('noi.eio.world.base-tile.width')

/** The length of the strip along its middle (whole rows of tiles). */
export function lengthOf(wave: Wave): number {
  const runs = (wave.runs.reduce((sum, r) => sum + r.long, 0) + (wave.ease ?? 0)) / Math.cos(wave.slant * deg)
  return wave.runway + Math.ceil(runs / ROW()) * ROW() + wave.end
}

/** How finely the eased line is walked, in metres. */
const STEP = 0.5

interface Walked { readonly flat: number; readonly h: Float64Array; readonly z: Float64Array; readonly heading: Float64Array }
const walks = new WeakMap<Wave, Walked>()

/** The line walked once from where it starts to curve: its heading eased (each heading the average of those
 * within half an ease each way, so the curve grows and fades gradually instead of starting at once), and where
 * that takes it. The runs start half an ease in, so the line is still flat where it starts. */
function walked(wave: Wave): Walked {
  const known = walks.get(wave)
  if (known) return known
  const a = wave.slant * deg
  // the flat start reaches past the runway's last row by what the slant takes, so all of it is flat
  const flat = wave.runway * Math.cos(a) + (wave.across / 2) * Math.abs(Math.sin(a))
  const ease = wave.ease ?? 0
  const total = wave.runs.reduce((sum, r) => sum + r.long, 0) + ease
  // the heading as the runs give it, at u metres from where the walk starts
  const raw = (u: number): number => {
    let [left, heading] = [u - ease / 2, 0]
    if (left <= 0) return 0
    for (const run of wave.runs) {
      const d = Math.min(left, run.long)
      heading += (run.turn * deg * d) / run.long
      left -= d
      if (left <= 0) break
    }
    return heading
  }
  const n = Math.ceil(total / STEP) + 1
  const half = Math.round(ease / 2 / STEP)
  // running sums of the heading, so each eased heading is one subtraction
  const sums = new Float64Array(n + 2 * half + 1)
  for (let i = 1; i < sums.length; i++) sums[i] = sums[i - 1] + raw((i - 1 - half) * STEP)
  const heading = new Float64Array(n)
  for (let i = 0; i < n; i++) heading[i] = half ? (sums[i + 2 * half + 1] - sums[i]) / (2 * half + 1) : raw(i * STEP)
  const [h, z] = [new Float64Array(n), new Float64Array(n)]
  h[0] = flat
  for (let i = 1; i < n; i++) {
    const mid = (heading[i - 1] + heading[i]) / 2
    h[i] = h[i - 1] + STEP * Math.cos(mid)
    z[i] = z[i - 1] + STEP * Math.sin(mid)
  }
  const made = { flat, h, z, heading }
  walks.set(wave, made)
  return made
}

/** The side view: where the middle line is at a length `s` along the drawn line, and which way it heads (radians,
 * 0 level, more upward). Before the start and past the end it goes on straight. */
function side(wave: Wave, s: number): { h: number; z: number; heading: number } {
  const w = walked(wave)
  const u = s - w.flat
  if (u <= 0) return { h: s, z: 0, heading: 0 }
  const last = w.h.length - 1
  if (u >= last * STEP) {
    const [d, hd] = [u - last * STEP, w.heading[last]]
    return { h: w.h[last] + d * Math.cos(hd), z: w.z[last] + d * Math.sin(hd), heading: hd }
  }
  const i = Math.floor(u / STEP)
  const f = u / STEP - i
  return { h: w.h[i] + (w.h[i + 1] - w.h[i]) * f, z: w.z[i] + (w.z[i + 1] - w.z[i]) * f, heading: w.heading[i] + (w.heading[i + 1] - w.heading[i]) * f }
}

/** The frame before it is moved to stand by the middle of its base. The strip begins along +y with x across and z
 * up: the curled sheet's side view lies in a plane turned by the slant, and the sheet runs straight along `g`. */
function frameRaw(wave: Wave, x: number, y: number): Frame {
  const a = wave.slant * deg
  const [ca, sa] = [Math.cos(a), Math.sin(a)]
  const hAxis = { x: -sa, y: ca, z: 0 } // the side view's level way
  const g = { x: ca, y: sa, z: 0 } // the way the sheet runs straight
  const s = y * ca - x * sa // how far along the drawn line
  const t = y * sa + x * ca // how far along the sheet's straight way
  const p = side(wave, s)
  const [ch, sh] = [Math.cos(p.heading), Math.sin(p.heading)]
  const T = { x: hAxis.x * ch, y: hAxis.y * ch, z: sh }
  const up = { x: -hAxis.x * sh, y: -hAxis.y * sh, z: ch }
  return {
    at: { x: hAxis.x * p.h + g.x * t, y: hAxis.y * p.h + g.y * t, z: p.z },
    along: { x: T.x * ca + g.x * sa, y: T.y * ca + g.y * sa, z: T.z * ca },
    across: { x: -T.x * sa + g.x * ca, y: -T.y * sa + g.y * ca, z: -T.z * sa },
    up,
  }
}

/** How far the strip reaches each way before it is moved: every tile's corners. */
function rawReach(wave: Wave): { low: Xyz; high: Xyz } {
  const low = { x: Infinity, y: Infinity, z: Infinity }
  const high = { x: -Infinity, y: -Infinity, z: -Infinity }
  const L = lengthOf(wave)
  for (let y = 0; y <= L; y += ROW()) for (let x = -wave.across / 2; x <= wave.across / 2; x += COLUMN()) {
    const { at } = frameRaw(wave, x, y)
    low.x = Math.min(low.x, at.x); low.y = Math.min(low.y, at.y); low.z = Math.min(low.z, at.z)
    high.x = Math.max(high.x, at.x); high.y = Math.max(high.y, at.y); high.z = Math.max(high.z, at.z)
  }
  return { low, high }
}

const shifts = new WeakMap<Wave, Xyz>()
/** What moves the strip to stand by the middle of its base, as every element does. */
function shiftOf(wave: Wave): Xyz {
  const known = shifts.get(wave)
  if (known) return known
  const { low, high } = rawReach(wave)
  const shift = { x: -(low.x + high.x) / 2, y: -(low.y + high.y) / 2, z: -low.z }
  shifts.set(wave, shift)
  return shift
}

/** Where the strip's place x, y is, and its ways there, standing by the middle of its base. */
export function frameOf(wave: Wave, x: number, y: number): Frame {
  const f = frameRaw(wave, x, y)
  const d = shiftOf(wave)
  return { ...f, at: { x: f.at.x + d.x, y: f.at.y + d.y, z: f.at.z + d.z } }
}

/** How much room the strip takes along x, y and up. */
export function sizeOf(wave: Wave): Xyz {
  const { low, high } = rawReach(wave)
  return { x: high.x - low.x, y: high.y - low.y, z: high.z - low.z }
}
