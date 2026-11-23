// THE BASE PLATFORM AS A WAVE AND A CIRCULAR TWIST (23 Nov 2026, issue 130). The user drew it from the side: "it
// starts with a wave that goes up and then down, and then it becomes a spiral", and "we should always keep the
// tiles the way they are. Do not squeeze or reshape them." How it is laid, and the picks, are in wave.ts.
// Made from the base tile and the astroid it is given (elements.ts hands them in, so this file needs nothing of
// elements.ts but its types).
import type { Laid, WorldElement } from './elements.ts'
import { frameOf, lengthOf, PROFILE, sizeOf, type Wave } from './wave.ts'

/** The strip's shape: 21 tiles across, along the drawn line. The curl moves toward high x as it goes
 * round. The user, 23 Nov 2026: "the last curl is not smooth. Can you make the curling more smoother? And also,
 * the beginning of the strip is too long. You can just chop it off just before it starts to curl." So the 600 m
 * flat start is gone (it begins where it starts to rise), and every change of curve is eased in over 150 m (my
 * pick of length). Then: "The end of the curl is also too long." So the 200 m flat end is gone too, and the
 * run out past the curl's far side is 100 m (it was 180). */
export const WAVE: Wave = { kind: 'wave', runway: 0, runs: PROFILE, end: 0, across: 210, slant: 15, ease: 150 }

type Thing = { element: WorldElement; at: { x: number; y: number }; under?: true }

/** The base platform laid as a wave and a circular twist, from `tile` and `astroid`: tiles and astroids on both
 * faces, every tile whole. */
export function wavePlatform(
  tile: WorldElement,
  astroid: WorldElement,
  wave: Wave = WAVE,
  id = 'wave-platform',
  name = 'Base platform, wave and circular twist',
): WorldElement & { readonly shape: Laid } {
  const [stepX, stepY] = [tile.size.x, tile.size.y]
  const [hx, long] = [wave.across / 2, lengthOf(wave)]
  const things: Thing[] = []
  for (const under of [false, true]) {
    const face = under ? { under: true as const } : {}
    for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2; y < long; y += stepY) things.push({ element: tile, at: { x, y }, ...face })
    // an astroid wherever four tiles meet: at every corner of a section that is not on the strip's edge
    for (let x = stepX - hx; x < hx; x += stepX) for (let y = stepY; y < long; y += stepY) things.push({ element: astroid, at: { x, y }, ...face })
  }
  const size = sizeOf(wave)
  const count = (of: WorldElement) => things.filter(t => t.element === of).length
  return {
    id,
    name,
    says: `The base platform laid as the user drew it from the side: a wave that rises and falls, then a circular twist that comes out higher than it began. ${long.toLocaleString('en')} m long, every tile square. A trial: nothing is set on it yet.`,
    size: { x: Math.round(size.x * 10) / 10, y: Math.round(size.y * 10) / 10, z: Math.round(size.z * 10) / 10 },
    shape: {
      kind: 'laid',
      things,
      says: `${count(tile)} base tiles and ${count(astroid)} astroids, half of them on each face`,
      frame: (x, y) => frameOf(wave, x, y),
    },
    surface: { ...tile.surface, says: `${tile.surface.says} tiles, astroids in the secondary colour` },
  }
}

/** The angle the user chose as our logo (23 Nov 2026, issue 130), looking at the wave platform from the low-x
 * side: "I want this angle to be our logo." Matched by eye to the user's own picture of it (my reading of their
 * angle, in the gallery's view with the ride turned off). Asked what to make of it, they chose logo pictures only,
 * nothing in the app yet. */
export const LOGO_VIEW = { from: { x: -1550, y: 550, z: 380 }, at: { x: 0, y: -60, z: 250 } } as const
