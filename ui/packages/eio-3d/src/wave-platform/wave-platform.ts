// THE BASE PLATFORM AS A WAVE AND A CIRCULAR TWIST (23 Nov 2026, issue 130). The user drew it from the side, with two
// parts named "Wave" and "Circular twist": "it starts with a wave that goes up and then down, and then it becomes
// a spiral", and "we should always keep the tiles the way they are. Do not squeeze or reshape them." How a strip
// is laid so is drawing/wave.ts.
// Then: "the last curl is not smooth. Can you make the curling more smoother? And also, the beginning of the strip
// is too long. You can just chop it off just before it starts to curl." So the flat start is gone (it begins
// where it starts to rise), and every change of curve is eased in. Then: "The end of the curl is also too long."
// So the flat end is gone too.
// FROM THE USER'S WORDS AND DRAWING: the line seen from the side; no flat start and no flat end; as wide as the base
// platform (21 tiles); every tile whole.
// MY PICKS, not the user's word: every length and turn of the line's thirteen runs, laid over the drawing; the
// slant; the easing; tiles on both faces. Every number is Eidos's (noi.eio.world.wave-platform), each by the key
// Mero holds for it, and the width is the base platform's; what each run is, in words, is this element's own.
import type { WavePlatformMeasure } from '@noi/eio-tokens/components'
import { ASTROID } from '../astroid/astroid.ts'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { value } from '../drawing/eidos.ts'
import type { Laid, WorldElement } from '../drawing/element.ts'
import { frameOf, lengthOf, sizeOf, type Run, type Wave } from '../drawing/wave.ts'

/** Each measure of the wave strip, as Eidos holds it: lengths in metres, the slant and the turns in degrees. */
export const WAVE_PLATFORM_MEASURES: Record<WavePlatformMeasure, number> = {
  width: value('noi.eio.world.base-platform.width'),
  runway: value('noi.eio.world.wave-platform.runway'),
  end: value('noi.eio.world.wave-platform.end'),
  slant: value('noi.eio.world.wave-platform.slant'),
  ease: value('noi.eio.world.wave-platform.ease'),
  'run-1-long': value('noi.eio.world.wave-platform.run-1-long'),
  'run-1-turn': value('noi.eio.world.wave-platform.run-1-turn'),
  'run-2-long': value('noi.eio.world.wave-platform.run-2-long'),
  'run-2-turn': value('noi.eio.world.wave-platform.run-2-turn'),
  'run-3-long': value('noi.eio.world.wave-platform.run-3-long'),
  'run-3-turn': value('noi.eio.world.wave-platform.run-3-turn'),
  'run-4-long': value('noi.eio.world.wave-platform.run-4-long'),
  'run-4-turn': value('noi.eio.world.wave-platform.run-4-turn'),
  'run-5-long': value('noi.eio.world.wave-platform.run-5-long'),
  'run-5-turn': value('noi.eio.world.wave-platform.run-5-turn'),
  'run-6-long': value('noi.eio.world.wave-platform.run-6-long'),
  'run-6-turn': value('noi.eio.world.wave-platform.run-6-turn'),
  'run-7-long': value('noi.eio.world.wave-platform.run-7-long'),
  'run-7-turn': value('noi.eio.world.wave-platform.run-7-turn'),
  'run-8-long': value('noi.eio.world.wave-platform.run-8-long'),
  'run-8-turn': value('noi.eio.world.wave-platform.run-8-turn'),
  'run-9-long': value('noi.eio.world.wave-platform.run-9-long'),
  'run-9-turn': value('noi.eio.world.wave-platform.run-9-turn'),
  'run-10-long': value('noi.eio.world.wave-platform.run-10-long'),
  'run-10-turn': value('noi.eio.world.wave-platform.run-10-turn'),
  'run-11-long': value('noi.eio.world.wave-platform.run-11-long'),
  'run-11-turn': value('noi.eio.world.wave-platform.run-11-turn'),
  'run-12-long': value('noi.eio.world.wave-platform.run-12-long'),
  'run-12-turn': value('noi.eio.world.wave-platform.run-12-turn'),
  'run-13-long': value('noi.eio.world.wave-platform.run-13-long'),
  'run-13-turn': value('noi.eio.world.wave-platform.run-13-turn'),
}

const M = WAVE_PLATFORM_MEASURES

/** The line seen from the side, as the user drew it from the left: each run so long, and turning so far. */
export const PROFILE: readonly Run[] = [
  { long: M['run-1-long'], turn: M['run-1-turn'], says: 'the wave starts to rise' },
  { long: M['run-2-long'], turn: M['run-2-turn'], says: 'rising' },
  { long: M['run-3-long'], turn: M['run-3-turn'], says: 'over the top of the wave' },
  { long: M['run-4-long'], turn: M['run-4-turn'], says: 'down the wave, leaning back a little' },
  { long: M['run-5-long'], turn: M['run-5-turn'], says: 'round the bottom of the wave' },
  { long: M['run-6-long'], turn: M['run-6-turn'], says: 'rising toward the twist' },
  { long: M['run-7-long'], turn: M['run-7-turn'], says: 'over the top of the twist' },
  { long: M['run-8-long'], turn: M['run-8-turn'], says: 'down its far side' },
  { long: M['run-9-long'], turn: M['run-9-turn'], says: 'round its bottom' },
  { long: M['run-10-long'], turn: M['run-10-turn'], says: 'up its near side' },
  { long: M['run-11-long'], turn: M['run-11-turn'], says: 'curving out under its top' },
  { long: M['run-12-long'], turn: M['run-12-turn'], says: 'rising out past its far side' },
  { long: M['run-13-long'], turn: M['run-13-turn'], says: 'levelling off, higher than the start' },
]

/** The strip's shape: as wide as the base platform, along the drawn line, the curl moving toward high x as it
 * goes round. */
export const WAVE: Wave = {
  kind: 'wave',
  runway: WAVE_PLATFORM_MEASURES.runway,
  runs: PROFILE,
  end: WAVE_PLATFORM_MEASURES.end,
  across: WAVE_PLATFORM_MEASURES.width,
  slant: WAVE_PLATFORM_MEASURES.slant,
  ease: WAVE_PLATFORM_MEASURES.ease,
}

type Thing = { element: WorldElement; at: { x: number; y: number }; under?: true }

const things: Thing[] = (() => {
  const [stepX, stepY] = [BASE_TILE.size.x, BASE_TILE.size.y]
  const [hx, long] = [WAVE.across / 2, lengthOf(WAVE)]
  const laid: Thing[] = []
  for (const under of [false, true]) {
    const face = under ? { under: true as const } : {}
    for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2; y < long; y += stepY) laid.push({ element: BASE_TILE, at: { x, y }, ...face })
    // an astroid wherever four tiles meet: at every corner of a section that is not on the strip's edge
    for (let x = stepX - hx; x < hx; x += stepX) for (let y = stepY; y < long; y += stepY) laid.push({ element: ASTROID, at: { x, y }, ...face })
  }
  return laid
})()

/** How much room the strip takes, said to the tenth of a metre. */
const room = sizeOf(WAVE)
const tenth = (n: number) => Math.round(n * 10) / 10
const count = (of: WorldElement) => things.filter(t => t.element === of).length

/** The base platform laid as a wave and a circular twist: tiles and astroids on both faces, every tile whole. */
export const WAVE_PLATFORM: WorldElement & { readonly shape: Laid } = {
  id: 'wave-platform',
  name: 'Base platform, wave and circular twist',
  says: `The base platform laid as the user drew it from the side: a wave that rises and falls, then a circular twist that comes out higher than it began. ${lengthOf(WAVE).toLocaleString('en')} m long, every tile square. A trial: nothing is set on it yet.`,
  size: { x: tenth(room.x), y: tenth(room.y), z: tenth(room.z) },
  shape: {
    kind: 'laid',
    things,
    says: `${count(BASE_TILE)} base tiles and ${count(ASTROID)} astroids, half of them on each face`,
    frame: (x, y) => frameOf(WAVE, x, y),
  },
  surface: { ...BASE_TILE.surface, says: `${BASE_TILE.surface.says} tiles, astroids in the secondary colour` },
}
