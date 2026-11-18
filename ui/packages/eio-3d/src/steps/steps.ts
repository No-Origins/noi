// THE STEPS (noi.eio.world.steps). Moved from the 3D world page: half rings behind the pool, each higher
// than the one before, plain black to walk on (the user, 17 Nov: "keep the surface of the steps black"),
// with one line at the lip of each so that they can be seen. The top step, where the arches stand, runs
// out to where nothing of the land is left, and dissolves with it. The steps are land: they dissolve the
// land's way, and only the top step carries circles.
// The shape is made around the pool's middle and facing straight ahead (+z); the drawing turns it into
// the world (z becomes -z), so in the world the steps rise behind the pool, toward -z.
import { NONE, pusher } from '../drawing/gl.ts'
import type { Vec3 } from '../drawing/math.ts'

export interface StepsValues {
  /** How far from the pool's middle the first step begins (noi.eio.world.steps.start). */
  start: number
  /** How deep one step is to walk on (noi.eio.world.steps.depth). */
  depth: number
  /** How high one step is (noi.eio.world.steps.height). */
  height: number
  /** How high the top step is above the land: the level the arches stand on (noi.eio.world.steps.top). */
  top: number
  /** Where the top step runs out: where nothing of the land is left (land radius and edge band). */
  reach: number
}

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { StepsMeasure } from '@noi/eio-tokens/components'
export type { StepsMeasure }

export const STEPS_MEASURES: Record<StepsMeasure, string> = { start: 'Where the steps begin', depth: 'Step depth', height: 'Step height', top: 'Top step height' }

export function stepsValue(v: StepsValues, which: StepsMeasure): number { return v[which] }

/** How many steps there are, the top one counted: the top step's height over one step's height (32
 * today). Mero does not hold the count: it follows from these two. */
export function stepCount(v: StepsValues): number { return Math.max(1, Math.round(v.top / v.height)) }

/** Each step: where it begins and ends (from the pool's middle) and how high it is. The narrow ones,
 * then the wide top one that runs out to `reach`. */
export function stepsList(v: StepsValues): [number, number, number][] {
  const n = stepCount(v), out: [number, number, number][] = []
  for (let i = 0; i < n - 1; i++) out.push([v.start + v.depth * i, v.start + v.depth * (i + 1), v.height * (i + 1)])
  out.push([v.start + v.depth * (n - 1), Math.max(v.reach, v.start + v.depth * n), v.height * n])
  return out
}

/** How many pieces each half ring is made of, as on the world page. */
const PIECES = 96

/** The steps. Only the lip of each step asks for a line (and the top step's back, and the two straight
 * ends of each): the one grey line without which black steps could not be seen. */
export function stepsShape(v: StepsValues): Float32Array {
  const out: number[] = [], quad = pusher(out), P = Math.PI / 2, list = stepsList(v)
  const pt = (r: number, a: number, y: number): Vec3 => [r * Math.sin(a), y, r * Math.cos(a)]
  let prev = 0
  list.forEach(([r0, r1, h], si) => {
    const last = si === list.length - 1
    for (let i = 0; i < PIECES; i++) {
      const a0 = -P + Math.PI * i / PIECES, a1 = -P + Math.PI * (i + 1) / PIECES, am = (a0 + a1) / 2
      quad(pt(r0, a0, h), pt(r0, a1, h), pt(r1, a1, h), pt(r1, a0, h), [0, 1, 0], [0, 0, 1, last ? 1 : 0])                 // what you step on
      quad(pt(r0, a0, prev), pt(r0, a1, prev), pt(r0, a1, h), pt(r0, a0, h), [-Math.sin(am), 0, -Math.cos(am)], NONE)   // its front, facing the pool
      if (last) quad(pt(r1, a0, 0), pt(r1, a1, 0), pt(r1, a1, h), pt(r1, a0, h), [Math.sin(am), 0, Math.cos(am)], NONE) // the back of the top step
    }
    quad(pt(r0, -P, 0), pt(r1, -P, 0), pt(r1, -P, h), pt(r0, -P, h), [0, 0, -1], [0, 0, 0, 1])                       // the two straight ends
    quad(pt(r0, P, 0), pt(r1, P, 0), pt(r1, P, h), pt(r0, P, h), [0, 0, -1], [0, 0, 0, 1])
    prev = h
  })
  return new Float32Array(out)
}

/** The step a close measure is shown on: a third of the way up. */
const SHOWN = (v: StepsValues) => Math.floor(stepCount(v) / 3)

/** Where a measure lies, in the world (the steps toward -z), straight behind the pool's middle. */
export function stepsMeasure(v: StepsValues, which: StepsMeasure): { from: Vec3; to: Vec3; tick: Vec3 } {
  const list = stepsList(v), lift = 0.02
  switch (which) {
    case 'start': return { from: [0, lift, 0], to: [0, lift, -v.start], tick: [1, 0, 0] }
    case 'depth': { const [r0, r1, h] = list[SHOWN(v)]; return { from: [0, h + lift, -r0], to: [0, h + lift, -r1], tick: [1, 0, 0] } }
    case 'height': { const i = SHOWN(v), [r0, , h] = list[i], below = i ? list[i - 1][2] : 0; return { from: [0, below, -r0 + lift], to: [0, h, -r0 + lift], tick: [1, 0, 0] } }
    case 'top': { const r0 = list[list.length - 1][0]; return { from: [0, 0, -r0 + lift], to: [0, v.top, -r0 + lift], tick: [1, 0, 0] } }
  }
}
