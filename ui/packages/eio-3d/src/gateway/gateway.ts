// THE GATEWAY (noi.eio.world.gateway) AND ITS LIME RIPPLES (noi.eio.world.ripples). Moved from the 3D world page.
// Behind a system's arch its inner walls carry on, the same white, and dissolve into dust the deeper they go
// (the user, 17 Nov: "Yes, all five"); in the world it is seen only through its arch. While a character flies
// in, it goes on as a thin dust, and rings of lime run along it from behind the character, past him and on
// ahead, one passing him every gap (the user, 17 Nov: "Keep 1 second").
// The shape is made facing straight ahead, from the arch's door (its upright back) along +z; the drawing
// turns it into the world, where the arch stands at -z, so in the world the gateway runs on toward -z.
import type { ArchValues } from '../arch/arch.ts'
import { NONE, pusher } from '../drawing/gl.ts'
import type { Vec3 } from '../drawing/math.ts'

export interface GatewayValues {
  /** The arch it is behind: its opening is the gateway's size, its back is the gateway's door. */
  arch: ArchValues
  /** How far in its walls go before nothing is left of them (noi.eio.world.gateway.depth). */
  depth: number
  /** One grain of the dust its walls dissolve into (noi.eio.world.edge.grain). */
  grain: number
}

export interface RippleValues {
  /** How often a lime ripple passes the character (noi.eio.world.ripples.gap), seconds. */
  gap: number
  /** How much faster than the character a ripple runs past him (noi.eio.world.ripples.speed), m/s. */
  speed: number
  /** How long a ripple's fading tail is (noi.eio.world.ripples.tail), metres. */
  tail: number
  /** How far behind the character the ripples start (noi.eio.world.ripples.behind), metres. */
  behind: number
  /** How far ahead of the character they fade out (noi.eio.world.ripples.ahead), metres. */
  ahead: number
}

/** The arch's opening: as wide as the arch less its two posts, as tall as it less its beam. */
export function opening(a: ArchValues) { return { width: a.width - 2 * a.thickness, height: a.height - a.thickness } }

/** The gateway's walls, `length` metres of them: two sides, the top and the floor, each looking inward,
 * exactly as wide and as tall as the arch's opening. One block of white, no lines on it. */
export function gatewayShape(a: ArchValues, length: number): Float32Array {
  const out: number[] = [], quad = pusher(out), o = opening(a), x = o.width / 2, h = o.height, z0 = a.distance, z1 = a.distance + length
  quad([-x, 0, z0], [-x, 0, z1], [-x, h, z1], [-x, h, z0], [1, 0, 0], NONE)
  quad([x, 0, z0], [x, 0, z1], [x, h, z1], [x, h, z0], [-1, 0, 0], NONE)
  quad([-x, h, z0], [-x, h, z1], [x, h, z1], [x, h, z0], [0, -1, 0], NONE)
  quad([-x, 0, z0], [-x, 0, z1], [x, 0, z1], [x, 0, z0], [0, 1, 0], NONE)
  return new Float32Array(out)
}

/** A place in the gateway, in the world: `depth` metres in from its door, `up` metres above its floor. */
export function inGateway(a: ArchValues, depth: number, up = 0): Vec3 { return [0, up, -(a.distance + depth)] }

/** How far apart two ripples are along the gateway: one passes the character every gap, at its speed past him. */
export function rippleSpacing(r: RippleValues): number { return r.speed * r.gap }

/** Where the ripples' fronts are now, relative to the character (metres ahead of him), as the painter draws
 * them: they have run `run` metres since the last one passed (0 up to the spacing). Only those between where
 * they start behind him and where they fade out ahead. */
export function rippleFronts(r: RippleValues, run: number): number[] {
  const step = rippleSpacing(r), out: number[] = []
  for (let k = Math.ceil((-r.behind - run) / step); run + k * step <= r.ahead; k++) out.push(run + k * step)
  return out
}

// Its measures are the keys Mero holds for it, written by Mero into @noi/eio-tokens (Component States,
// agreed 18 Nov): the table below names every one, so a measure missing here, or one Mero never
// approved, fails the type check.
import type { GatewayMeasure } from '@noi/eio-tokens/components'
export type { GatewayMeasure }

export const GATEWAY_MEASURES: Record<GatewayMeasure, string> = {
  depth: 'Gateway depth', gap: 'Lime ripple gap', speed: 'Lime ripple speed', tail: 'Lime ripple tail',
  behind: 'Lime ripples from behind', ahead: 'Lime ripples ahead',
}

/** The unit each measure is in: a gap is a time, a speed is a speed, the rest are lengths. */
export const GATEWAY_UNITS: Record<GatewayMeasure, string> = { depth: 'm', gap: 's', speed: 'm/s', tail: 'm', behind: 'm', ahead: 'm' }
