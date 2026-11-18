// THE ARCH: one element, held once in Eidos (noi.eio.world.arch), placed once for each system Mero holds.
// Moved from the 3D world page (its systemArchShape and trailShape), with its numbers coming from Eidos
// instead of the page: how tall, how wide, how thick, how far its top reaches toward the pool, and how
// far its back stands from the pool's middle.
//
// The shape is made facing "straight ahead": its back at `distance` along +z, its front leaning back
// toward the pool. The drawing turns it into the world (z becomes -z), so in the world the pool's middle
// is at the origin and the arch stands at -distance, facing the pool.
import { NONE, pusher } from '../drawing/gl.ts'
import type { Vec3 } from '../drawing/math.ts'

export interface ArchValues {
  /** How tall (noi.eio.world.arch.height). */
  height: number
  /** How wide (noi.eio.world.arch.width). */
  width: number
  /** How thick its posts and beam are (noi.eio.world.arch.thickness). */
  thickness: number
  /** How far its top reaches toward the pool, past its upright back (noi.eio.world.arch.reach). */
  reach: number
  /** How far its back stands from the pool's middle (noi.eio.world.arch.distance). */
  distance: number
}

/** A system's arch, as the user drew it from the side (17 Nov): a triangle. Its back stands upright; its
 * top reaches toward the pool; it comes to nothing at the ground. From the front it is a frame: two posts
 * and a beam. It is one block, with no lines on it (the user, 17 Nov), so no face asks for an edge. Its
 * back is left open: the block goes on behind it (see `blockShape`). */
export function archShape(a: ArchValues): Float32Array {
  const out: number[] = [], quad = pusher(out)
  const w = a.width / 2, t = a.thickness, h = a.height, h1 = h - t, k = a.distance, s = a.reach / a.height
  const n = Math.hypot(1, s), face: Vec3 = [0, -s / n, -1 / n], f1 = k - s * h1, f = k - s * h
  // the front: two posts and the beam, leaning out over the steps toward the pool
  quad([-w, 0, k], [-w + t, 0, k], [-w + t, h1, f1], [-w, h1, f1], face, NONE)
  quad([w - t, 0, k], [w, 0, k], [w, h1, f1], [w - t, h1, f1], face, NONE)
  quad([-w, h1, f1], [w, h1, f1], [w, h, f], [-w, h, f], face, NONE)
  // the top
  quad([-w, h, f], [w, h, f], [w, h, k], [-w, h, k], [0, 1, 0], NONE)
  // the two outer sides: each is the triangle of the side view
  quad([-w, 0, k], [-w, h, k], [-w, h, f], [-w, 0, k], [-1, 0, 0], NONE)
  quad([w, 0, k], [w, h, k], [w, h, f], [w, 0, k], [1, 0, 0], NONE)
  // the inner sides of the two posts, and the underside of the beam
  quad([-w + t, 0, k], [-w + t, h1, k], [-w + t, h1, f1], [-w + t, 0, k], [1, 0, 0], NONE)
  quad([w - t, 0, k], [w - t, h1, k], [w - t, h1, f1], [w - t, 0, k], [-1, 0, 0], NONE)
  quad([-w + t, h1, f1], [w - t, h1, f1], [w - t, h1, k], [-w + t, h1, k], [0, -1, 0], NONE)
  return new Float32Array(out)
}

/** The user's second sketch (17 Nov): behind its upright back the block goes on, the same frame, and
 * fades into dust. Where it fades is not decided here: the one rule for the edge of the world decides it,
 * by place. So the block only has to go on further than the place where nothing is left (`until`, from
 * the pool's middle). */
export function blockShape(a: ArchValues, until: number): Float32Array {
  const out: number[] = [], quad = pusher(out)
  const w = a.width / 2, t = a.thickness, h = a.height, h1 = h - t, k = a.distance, e = Math.max(k, until) + a.thickness
  quad([-w, 0, k], [-w, 0, e], [-w, h, e], [-w, h, k], [-1, 0, 0], NONE)
  quad([w, 0, k], [w, 0, e], [w, h, e], [w, h, k], [1, 0, 0], NONE)
  quad([-w, h, k], [-w, h, e], [w, h, e], [w, h, k], [0, 1, 0], NONE)
  quad([-w + t, 0, k], [-w + t, 0, e], [-w + t, h1, e], [-w + t, h1, k], [1, 0, 0], NONE)
  quad([w - t, 0, k], [w - t, 0, e], [w - t, h1, e], [w - t, h1, k], [-1, 0, 0], NONE)
  quad([-w + t, h1, k], [-w + t, h1, e], [w - t, h1, e], [w - t, h1, k], [0, -1, 0], NONE)
  return new Float32Array(out)
}

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { ArchMeasure } from '@noi/eio-tokens/components'
export type { ArchMeasure }

/** The words for each measure, as its page in Mero names it. */
export const ARCH_MEASURES: Record<ArchMeasure, string> = {
  height: 'Height', width: 'Width', thickness: 'Thickness', reach: 'Reach', distance: 'Distance from the pool',
}

/** Where a measure lies on the arch, in the world (the pool's middle at the origin, the arch at -z):
 * a line from `from` to `to`, a little off the block so that it can be seen, and the way its two end
 * ticks point. */
export function archMeasure(a: ArchValues, which: ArchMeasure): { from: Vec3; to: Vec3; tick: Vec3 } {
  const w = a.width / 2, h = a.height, k = a.distance, f = k - a.reach, off = Math.max(2, a.thickness / 2)
  const world = (p: Vec3): Vec3 => [p[0], p[1], -p[2]]
  switch (which) {
    case 'height': return { from: world([w + off, 0, k]), to: world([w + off, h, k]), tick: [1, 0, 0] }
    case 'width': return { from: world([-w, h + off, f]), to: world([w, h + off, f]), tick: [0, 1, 0] }
    case 'thickness': return { from: world([-w, -off / 2, k - off]), to: world([-w + a.thickness, -off / 2, k - off]), tick: [0, 1, 0] }
    case 'reach': return { from: world([w + off, h, k]), to: world([w + off, h, f]), tick: [0, 1, 0] }
    case 'distance': return { from: [0, 0.05, 0], to: world([0, 0.05, k]), tick: [1, 0, 0] }
  }
}

/** THE ARCHES FOLLOW MERO (decision 12, the user: "yes, follow Mero"): one arch for each system Mero holds,
 * given in the order the caller lists them, spread over the half circle behind the pool. Five stand 36 degrees
 * apart, from -72 to 72, as in the world; fewer keep that gap, centred; more are drawn closer so that all of
 * them stay on the half circle. 0 is straight ahead as you come in; the arch at that place faces the pool. */
export function archPlaces<T>(systems: T[]): { system: T; degrees: number }[] {
  const n = systems.length, most = 144, gap = n > 1 ? Math.min(36, most / (n - 1)) : 0
  return systems.map((system, i) => ({ system, degrees: (i - (n - 1) / 2) * gap }))
}
