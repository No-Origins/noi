// THE BASE PLATFORM AS A MÖBIUS STRIP (23 Nov 2026, issue 127, pieces 51 to 53). The user: "Now, what I want us
// to try is that to make the base platform of the world like a Mobius strip." First a round loop, whose tiles
// stretched and squeezed: "I want the tiles to be always a square? I mean, without deforming the current base
// tile what we have, and then we can have the strip as long as needed." Then a 7 km loop of straight runs and
// bends: "the strip is too long and not as smooth as the previous version ... Most parts feel like a plane
// without any curve. So yeah, maybe think about it again."
// FROM THE USER'S WORDS: a Möbius strip; as wide as the base platform (21 tiles); every base tile square and as
// it is; shorter than 7 km and curving all the way round.
// MY PICKS, not the user's word: its length, and the shape a search found (drawing/bend.ts): it bends only across
// its face and twists gently; a trial in the gallery, the world left as it is; tiles and astroids on BOTH faces,
// since a Möbius strip has one side only (go once round and one is on the underside); nothing can be set on it
// yet. How it bends and how it twists are two lists of seven numbers each (radians a kilometre: the mean, then
// the cosine and sine of one, two and three waves round the loop), which no kind of value in Eidos holds: they
// are this element's own.
import type { MobiusPlatformMeasure } from '@noi/eio-tokens/components'
import { ASTROID } from '../astroid/astroid.ts'
import { BASE_PLATFORM_MEASURES } from '../base-platform/base-platform.ts'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { bentSize, lengthOf, type Bend } from '../drawing/bend.ts'
import { value } from '../drawing/eidos.ts'
import type { Laid, WorldElement } from '../drawing/element.ts'

/** Each measure of the Möbius strip, in metres: its length round, as many tiles as Eidos holds; and its width,
 * the base platform's. */
export const MOBIUS_PLATFORM_MEASURES: Record<MobiusPlatformMeasure, number> = {
  length: value('noi.eio.world.mobius-platform.tiles-round') * BASE_TILE.size.y,
  width: BASE_PLATFORM_MEASURES.width,
}

const MOBIUS_BEND: Bend = {
  kind: 'ribbon',
  long: MOBIUS_PLATFORM_MEASURES.length,
  across: MOBIUS_PLATFORM_MEASURES.width,
  // tiles on both faces: twice a tile's thickness
  thick: 2 * BASE_TILE.size.z,
  bending: [3.080208, 0.314758, -0.033857, -1.058429, -1.767426, 0.921302, -1.469235],
  twisting: [-0.806171, -1.989551, -1.15165, 0.319887, 0.768751, 0.027262, -0.07992],
}

const things: Array<{ element: WorldElement; at: { x: number; y: number }; under?: true }> = (() => {
  const [stepX, stepY] = [BASE_TILE.size.x, BASE_TILE.size.y]
  const [hx, long] = [MOBIUS_BEND.across / 2, lengthOf(MOBIUS_BEND)]
  const laid: Array<{ element: WorldElement; at: { x: number; y: number }; under?: true }> = []
  for (const under of [false, true]) {
    const face = under ? { under: true as const } : {}
    for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2; y < long; y += stepY) laid.push({ element: BASE_TILE, at: { x, y }, ...face })
    // round the loop there is no first or last row: an astroid at every row's start, where the last row meets the first too
    for (let x = stepX - hx; x < hx; x += stepX) for (let y = 0; y < long; y += stepY) laid.push({ element: ASTROID, at: { x, y }, ...face })
  }
  return laid
})()

/** How much room the strip takes, said to the tenth of a metre. */
const room = bentSize(MOBIUS_BEND)
const tenth = (n: number) => Math.round(n * 10) / 10

/** The base platform laid into a Möbius strip: square base tiles and astroids on both faces, curving and twisting
 * round to come back to its start turned over. */
export const MOBIUS_PLATFORM: WorldElement & { readonly shape: Laid & { readonly bend: Bend } } = {
  id: 'mobius-platform',
  name: 'Base platform, Möbius strip',
  says: `The base platform laid into a Möbius strip, ${lengthOf(MOBIUS_BEND).toLocaleString('en')} m round, curving all the way and every tile square. It has one side only. A trial: nothing is set on it yet.`,
  size: { x: tenth(room.x), y: tenth(room.y), z: tenth(room.z) },
  shape: {
    kind: 'laid',
    things,
    says: `${things.filter(t => t.element === BASE_TILE).length} base tiles and ${things.filter(t => t.element === ASTROID).length} astroids, half of them on each face`,
    bend: MOBIUS_BEND,
  },
  surface: { ...BASE_TILE.surface, says: `${BASE_TILE.surface.says} tiles, astroids in the secondary colour` },
}
