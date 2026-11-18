// THE LAND (noi.eio.world.land), ITS CIRCLES (noi.eio.world.circles) AND ITS EDGE (noi.eio.world.edge).
// Moved from the 3D world page. The land is one flat plane, painted by the ground painter (glsl.ts, FRAG):
// the darkest black of Eidos, no grid lines (the user, 17 Nov), rows of dashed circles round the pool
// out to the edge (the user, 17 Nov), and the one rule for the edge of the world, by place.
// In the world the pool's middle is the land's middle, at the origin.
import type { Vec3 } from '../drawing/math.ts'

export interface LandValues {
  /** How far the land reaches before it starts to dissolve (noi.eio.world.land.radius). */
  radius: number
  /** How far past that everything dissolves; past it nothing is left (noi.eio.world.edge.band). */
  band: number
  /** One grain of the dust (noi.eio.world.edge.grain). */
  grain: number
  /** A circle, from its middle to its line (noi.eio.world.circles.radius). */
  circleRadius: number
  /** The place each circle is given, middle to middle (noi.eio.world.circles.place). */
  place: number
  /** About how long one dash of a circle's line is (noi.eio.world.circles.dash). */
  dash: number
  /** How thick a circle's line is (noi.eio.world.circles.line). */
  line: number
  /** The water, from its middle to its edge (noi.eio.world.pool.radius): no circle lies on it. */
  poolRadius: number
  /** The wall round the water (noi.eio.world.wall.width): no circle lies on it either. */
  wallWidth: number
}

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { LandMeasure } from '@noi/eio-tokens/components'
export type { LandMeasure }

export const LAND_MEASURES: Record<LandMeasure, string> = {
  radius: 'Land radius', band: 'Edge band', grain: 'Dust grain', 'circle-radius': 'Circle radius',
  place: 'Circle place', dash: 'Circle dash', line: 'Circle line',
}

/** The value a measure shows. */
export function landValue(v: LandValues, which: LandMeasure): number {
  return { radius: v.radius, band: v.band, grain: v.grain, 'circle-radius': v.circleRadius, place: v.place, dash: v.dash, line: v.line }[which]
}

/** The first row of circles: its middle line clears the pool's wall by a place and a metre, as the world
 * page has it (its ROW0: the pool, the wall, half a place, and one metre more). */
export function firstRow(v: LandValues): number {
  return v.poolRadius + v.wallWidth + v.place / 2 + 1
}

/** How many circles go round row `row`, and the middle of circle `k` in it, as the ground painter works
 * them out: as many as fit, spaced evenly, circle 0 straight ahead (toward -z). */
export function circlesInRow(v: LandValues, row: number) {
  const R = firstRow(v) + row * v.place, n = Math.floor(Math.PI * R / (v.place / 2))
  const at = (k: number): Vec3 => { const a = k * 2 * Math.PI / n; return [R * Math.sin(a), 0, -R * Math.cos(a)] }
  return { R, n, at }
}

/** The row this page's circle measures are shown on: the second, near the pool, toward the eye. */
const ROW = 1

/** Where a measure lies on the land: a line on the ground, and the way its end ticks point. */
export function landMeasure(v: LandValues, which: LandMeasure): { from: Vec3; to: Vec3; tick: Vec3 } {
  const lift = 0.02 // just above the ground, so that a mark is never under it
  const row = circlesInRow(v, ROW), k = Math.round(row.n / 2), c = row.at(k) // a circle toward the eye (+z)
  const ring = (a: number, r: number): Vec3 => [c[0] + r * Math.sin(a), lift, c[2] + r * Math.cos(a)]
  switch (which) {
    case 'radius': return { from: [0, lift, 0], to: [0, lift, v.radius], tick: [1, 0, 0] }
    case 'band': return { from: [0, lift, v.radius], to: [0, lift, v.radius + v.band], tick: [1, 0, 0] }
    case 'grain': { const z = v.radius + v.band * 0.25; return { from: [0, lift, z], to: [v.grain, lift, z], tick: [0, 0, 1] } }
    // on the middle of a dash: the painter starts its dashes with one whose middle is toward -z
    case 'circle-radius': return { from: [c[0], lift, c[2]], to: ring(Math.PI, v.circleRadius), tick: [1, 0, 0] }
    case 'place': { const next = circlesInRow(v, ROW + 1); return { from: [0, lift, row.R], to: [0, lift, next.R], tick: [1, 0, 0] } }
    case 'dash': {
      // one dash: the ground painter puts a dash's middle at the top of the circle (toward -z), and makes
      // each dash half of a dash-and-gap, so a dash is the chord over a quarter of a dash-and-gap each way
      const nd = Math.max(8, Math.floor(Math.PI * v.circleRadius / Math.max(v.dash, 0.01) + 0.5)), half = Math.PI / (2 * nd)
      return { from: ring(Math.PI - half, v.circleRadius), to: ring(Math.PI + half, v.circleRadius), tick: [0, 0, 1] }
    }
    case 'line': return { from: ring(Math.PI, v.circleRadius - v.line / 2), to: ring(Math.PI, v.circleRadius + v.line / 2), tick: [1, 0, 0] }
  }
}
