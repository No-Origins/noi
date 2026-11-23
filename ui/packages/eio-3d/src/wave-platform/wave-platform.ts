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
// slant; the easing; tiles on both faces. The width is the base platform's; every other number is this element's
// own (since 23 Nov 2026, issue 131, an element's own numbers are not registered one by one), each given by the key
// Mero holds for it; what each run is, in words, is the element's own too.
import type { WavePlatformMeasure } from '@noi/eio-tokens/components'
import { ASTROID } from '../astroid/astroid.ts'
import { BASE_PLATFORM_MEASURES } from '../base-platform/base-platform.ts'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import type { Laid, WorldElement } from '../drawing/element.ts'
import { frameOf, lengthOf, sizeOf, type Run, type Wave } from '../drawing/wave.ts'

/** Each measure of the wave strip: lengths in metres, the slant and the turns in degrees. The runway before the
 * wave and the flat end after the twist are 0 m: both were chopped off ("You can just chop it off just before it
 * starts to curl"; "The end of the curl is also too long"). */
export const WAVE_PLATFORM_MEASURES: Record<WavePlatformMeasure, number> = {
  width: BASE_PLATFORM_MEASURES.width,
  runway: 0,
  end: 0,
  slant: 15,
  ease: 150,
  'run-1-long': 400,
  'run-1-turn': 55,
  'run-2-long': 340,
  'run-2-turn': 0,
  'run-3-long': 140,
  'run-3-turn': -155,
  'run-4-long': 380,
  'run-4-turn': 0,
  'run-5-long': 110,
  'run-5-turn': 160,
  'run-6-long': 440,
  'run-6-turn': 0,
  'run-7-long': 300,
  'run-7-turn': -150,
  'run-8-long': 240,
  'run-8-turn': 0,
  'run-9-long': 410,
  'run-9-turn': -200,
  'run-10-long': 120,
  'run-10-turn': 0,
  'run-11-long': 170,
  'run-11-turn': -55,
  'run-12-long': 100,
  'run-12-turn': 0,
  'run-13-long': 150,
  'run-13-turn': -15,
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
