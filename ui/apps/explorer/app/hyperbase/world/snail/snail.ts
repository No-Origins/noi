// THE SUPER SNAIL, A CONCEPT (27 Nov 2026). The user: "Create an animated concept art of a super hero Snail ...
// The snail can have a booster that travels with boost, as a booster equipment attached to the snail. The boost is
// generated as the shell rotates and based on its acceleration and speed. The snail travels on the platform that's
// built in noi."
//
// A CONCEPT, NOT AN ELEMENT: nothing of the snail is registered in Mero, and @noi/eio-3d does not know it. It is
// drawn on a page of its own (/world/snail), on the world's own platform, in Eidos's colours. If the user takes it
// on, it becomes an element as the others did.
//
// FROM THE USER'S WORDS: it is a snail and a super hero; a booster is attached to it; the shell rotates; the boost
// comes from the shell's rotation, from how fast it turns and from how fast that grows; it travels on the platform.
// MY DESIGN, not the user's word: everything else. The shell is a flywheel on an axle over the snail's back, and
// two engines beside it burn what it makes. How much boost a turning shell gives (BOOST), how fast the shell winds
// up and runs down (SHELL), how the boost becomes speed (TRAVEL), the snail's size (BODY) and the show it plays by
// itself (SHOW) are all picks of this file, named here so that they are changed in one place.
//
// Nothing here knows three.js: this is what the snail is and does, as numbers. drawSnail.ts draws it.

/** THE SHELL, a flywheel. `idle` and `top`: how fast it turns at rest and at the most, in turns a second.
 * `windUp`: how long it takes from idle to top when driven, in seconds; `runDown`: how long from top back to idle
 * when let go (a flywheel keeps turning for a while). `settle`: how quickly it closes the last of the way, as a
 * share of what is left each second. `eases`: how long a change of its speeding up takes to come in, in seconds,
 * so nothing jumps. */
export const SHELL = { idle: 0.15, top: 4, windUp: 2.4, runDown: 5, settle: 4, eases: 0.25 } as const

/** THE BOOST, from 0 (none) to 1 (all the engines can burn). The user: "generated as the shell rotates and based
 * on its acceleration and speed." So it has two shares: `fromSpeed`, what a shell turning at its top speed gives
 * by that alone; and `fromSpeedingUp`, what is added while the shell is still gaining speed as fast as it can.
 * Together they are more than 1, so the engines burn fullest during the wind-up and settle to `fromSpeed` once
 * the shell turns steadily. A shell that slows gives nothing for slowing. */
export const BOOST = { fromSpeed: 0.7, fromSpeedingUp: 0.5 } as const

/** HOW THE BOOST BECOMES SPEED. `crawl`: how fast the snail goes with no boost, in metres a second. `thrust`: how
 * fast full boost speeds it up, in metres a second each second. `drag`: the share of its speed over a crawl that
 * it loses each second. So at full boost it settles at crawl + thrust / drag. */
export const TRAVEL = { crawl: 1.6, thrust: 30, drag: 0.42 } as const

/** The fastest the snail can go, in metres a second: where full boost and drag are even. */
export const FASTEST = TRAVEL.crawl + TRAVEL.thrust / TRAVEL.drag

/** The snail at one moment. */
export interface Snail {
  /** How far along the platform it is, in metres from the beginning. */
  readonly y: number
  /** How fast it travels, in metres a second. */
  readonly speed: number
  /** How fast its shell turns, in turns a second. */
  readonly spin: number
  /** How fast the shell's turning grows, in turns a second each second: less than 0 when it slows. */
  readonly speedingUp: number
  /** How far the shell has turned in all, in turns. */
  readonly turned: number
  /** The boost its engines burn, from 0 to 1. */
  readonly boost: number
}

/** The snail at rest at the beginning of the platform: its shell idling, no boost, crawling. */
export function atRest(y = 0): Snail {
  return { y, speed: TRAVEL.crawl, spin: SHELL.idle, speedingUp: 0, turned: 0, boost: 0 }
}

const clamp = (n: number, low: number, high: number) => Math.min(Math.max(n, low), high)

/** How fast the shell turns, as a share of the way from idle (0) to its top speed (1). */
export function spinShare(spin: number): number {
  return clamp((spin - SHELL.idle) / (SHELL.top - SHELL.idle), 0, 1)
}

/** The fastest the shell's turning can grow, in turns a second each second. */
export const FASTEST_WIND_UP = (SHELL.top - SHELL.idle) / SHELL.windUp

/** The boost a shell gives that turns so fast and whose turning grows so fast. */
export function boostOf(spin: number, speedingUp: number): number {
  const gaining = clamp(speedingUp / FASTEST_WIND_UP, 0, 1)
  return clamp(BOOST.fromSpeed * spinShare(spin) + BOOST.fromSpeedingUp * gaining, 0, 1)
}

/** The snail `passed` seconds later, its shell driven so hard: `drive` from 0 (let go) to 1 (driven all it can
 * be). The shell goes toward the speed the drive asks for, no faster than it can wind up or run down; the boost
 * is what that turning gives; the boost pushes the snail and drag holds it back. */
export function later(snail: Snail, drive: number, passed: number): Snail {
  const dt = clamp(passed, 0, 0.1) // after a pause nothing jumps
  if (dt === 0) return snail
  const wanted = SHELL.idle + clamp(drive, 0, 1) * (SHELL.top - SHELL.idle)
  const slowest = 0 - (SHELL.top - SHELL.idle) / SHELL.runDown
  const asked = clamp((wanted - snail.spin) * SHELL.settle, slowest, FASTEST_WIND_UP)
  // the change of its speeding up comes in over a moment
  const speedingUp = snail.speedingUp + (asked - snail.speedingUp) * (1 - Math.exp(0 - dt / SHELL.eases))
  const spin = clamp(snail.spin + speedingUp * dt, SHELL.idle, SHELL.top)
  const boost = boostOf(spin, speedingUp)
  const speed = Math.max(0, snail.speed + (TRAVEL.thrust * boost - TRAVEL.drag * (snail.speed - TRAVEL.crawl)) * dt)
  return { y: snail.y + speed * dt, speed, spin, speedingUp, turned: snail.turned + spin * dt, boost }
}

/** THE SHOW THE SNAIL PLAYS BY ITSELF, over and over: each part so many seconds long, the shell driven or let go.
 * It crawls; it winds its shell up and bursts away; it lets go and glides; a second, shorter burst; and it
 * glides down to a crawl again. */
export const SHOW: ReadonlyArray<{ readonly says: string; readonly drive: 0 | 1; readonly for: number }> = [
  { says: 'it crawls, its shell idling', drive: 0, for: 3.5 },
  { says: 'it winds its shell up and bursts away', drive: 1, for: 7.5 },
  { says: 'it lets go and glides', drive: 0, for: 4 },
  { says: 'a second, shorter burst', drive: 1, for: 4.5 },
  { says: 'it glides down to a crawl', drive: 0, for: 4.5 },
]

/** How long the show is, in seconds, before it starts again. */
export const SHOW_LASTS = SHOW.reduce((sum, part) => sum + part.for, 0)

/** How hard the show drives the shell `seconds` in: 0 or 1. */
export function showDrive(seconds: number): 0 | 1 {
  let left = ((seconds % SHOW_LASTS) + SHOW_LASTS) % SHOW_LASTS
  for (const part of SHOW) {
    if (left < part.for) return part.drive
    left -= part.for
  }
  return 0
}

/** THE SNAIL'S SIZE, in metres. It is half a tile long, so that it reads on the platform beside a tile. `long`:
 * from the tip of its tail to the front of its head. `wide` and `tall`: its foot at its widest, and how high its
 * back is. `headUp`: how high it carries the middle of its head. `shell`: how far the shell reaches from its
 * axle, and `shellWide`, how wide it is at its rim. `sunk`: how far the shell sits down into the back. */
export const BODY = { long: 5.2, wide: 1.5, tall: 0.95, headUp: 1.75, shell: 1.5, shellWide: 1.1, sunk: 0.28 } as const

/** How the eye of the page sees the snail: where it stands and what it looks at, each in the snail's own across
 * (to its right), along (its way) and up, in metres from the middle of its foot; and how wide it sees, in degrees
 * from the bottom of its picture to the top. */
export interface Shot {
  readonly from: readonly [across: number, along: number, up: number]
  readonly at: readonly [across: number, along: number, up: number]
  readonly sees: number
}

/** The three shots. `hero`: from before it and to a side, near, at its face. `side`: from its side, its shell and
 * its engines in full. `chase`: from behind, above and to a side, the platform running away before it. */
export const SHOTS = {
  hero: { from: [5.2, 8.6, 2.5], at: [0, 0.4, 1.7], sees: 30 },
  side: { from: [12.5, -1.2, 2.6], at: [0, -0.9, 1.7], sees: 30 },
  chase: { from: [6.4, -9.5, 4.4], at: [0, 3.2, 1.5], sees: 40 },
} as const satisfies Record<string, Shot>

export type ShotName = keyof typeof SHOTS

/** Which shot the eye takes: while the snail crawls, its face; for the first moments of a burst, its side, where
 * the shell is seen to wind up and the engines to light; then from behind, where its speed is seen. `burning`:
 * for how many seconds the engines have burnt without a break. MY PICKS: the two bounds. */
export function shotFor(snail: Snail, burning: number): ShotName {
  if (snail.boost > 0.05) return burning < 3.2 ? 'side' : 'chase'
  return snail.speed > 9 ? 'chase' : 'hero'
}
