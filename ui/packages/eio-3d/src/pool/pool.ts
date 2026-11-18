// THE POOL (noi.eio.world.pool) AND ITS WALL (noi.eio.world.wall). Moved from the 3D world page.
// The water is painted by the ground painter (glsl.ts, FRAG): small waves crossing and slow rings going
// out from the middle; looking across it, it mirrors what stands round it; looking down, it shows its own
// colour. The wall is a low white ring of stone round the water, 2 feet high (agreed 17 Nov), one block
// with no lines on it. The pool's middle is the land's middle, at the origin.
import { NONE, pusher } from '../drawing/gl.ts'
import type { Vec3 } from '../drawing/math.ts'

export interface WallValues {
  /** The water, from its middle to its edge (noi.eio.world.pool.radius); the wall stands on that edge. */
  poolRadius: number
  /** How high the wall is (noi.eio.world.wall.height). */
  height: number
  /** How wide the top of the wall is (noi.eio.world.wall.width). */
  width: number
}

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { PoolMeasure } from '@noi/eio-tokens/components'
export type { PoolMeasure }

export const POOL_MEASURES: Record<PoolMeasure, string> = { 'pool-radius': 'Pool radius', 'wall-height': 'Wall height', 'wall-width': 'Wall width' }

export function poolValue(v: WallValues, which: PoolMeasure): number {
  return { 'pool-radius': v.poolRadius, 'wall-height': v.height, 'wall-width': v.width }[which]
}

/** How many pieces the wall's ring is made of, as on the world page. */
const PIECES = 96

/** The wall: its top, its inner side facing the water, and its outer side. */
export function wallShape(v: WallValues): Float32Array {
  const out: number[] = [], quad = pusher(out), r0 = v.poolRadius, r1 = v.poolRadius + v.width, h = v.height
  const pt = (r: number, a: number, y: number): Vec3 => [r * Math.sin(a), y, r * Math.cos(a)]
  for (let i = 0; i < PIECES; i++) {
    const a0 = 2 * Math.PI * i / PIECES, a1 = 2 * Math.PI * (i + 1) / PIECES, am = (a0 + a1) / 2
    quad(pt(r0, a0, h), pt(r0, a1, h), pt(r1, a1, h), pt(r1, a0, h), [0, 1, 0], NONE)
    quad(pt(r0, a0, 0), pt(r0, a1, 0), pt(r0, a1, h), pt(r0, a0, h), [-Math.sin(am), 0, -Math.cos(am)], NONE)
    quad(pt(r1, a0, 0), pt(r1, a1, 0), pt(r1, a1, h), pt(r1, a0, h), [Math.sin(am), 0, Math.cos(am)], NONE)
  }
  return new Float32Array(out)
}

/** Where a measure lies, toward the eye (+z): the water's radius across its surface, the wall's height up
 * its outer side, the wall's width across its top. */
export function poolMeasure(v: WallValues, which: PoolMeasure): { from: Vec3; to: Vec3; tick: Vec3 } {
  const r0 = v.poolRadius, r1 = v.poolRadius + v.width, h = v.height, lift = 0.02
  switch (which) {
    case 'pool-radius': return { from: [0, lift, 0], to: [0, lift, r0], tick: [1, 0, 0] }
    case 'wall-height': { const z = r1 + Math.max(0.15, v.width * 0.3); return { from: [0, 0, z], to: [0, h, z], tick: [1, 0, 0] } }
    case 'wall-width': return { from: [0, h + lift, r0], to: [0, h + lift, r1], tick: [1, 0, 0] }
  }
}
