// THE LIGHT of the world (21 Nov 2026, issue 123 in noi-planning). MY PICK, not the user's word: one sun, from
// above and from low y and high x, and soft light from all of the sky. In plain light a matte face turned up
// shows its own colour as Eidos has it; faces turned away from the sun are darker, which is what shows a
// thing's shape. The same light falls on an element alone and on the land. One difference, measured on the
// screen on 21 Nov: an element looked at alone is lit more when its colour is too dark to show its faces
// (lightFor), so the base tile's top shows as a dark grey alone and darker on the land; the astroid's top is
// its own colour in both. The lights are put into the world's `xyz`: where the sun is, is said in the user's
// x, y, z. Every number of the light is Eidos's (noi.eio.world.light), and so is its colour (the role
// noi.eio.color.world.light). Where the sun is, a way, is this file's own (no kind of value holds a way), and
// so is plain light: three.js shows a matte face in its own colour when the light it gets is pi.
import { role, value } from './eidos.ts'
import type { ThreeWorld } from './space.ts'

/** The light. Where the sun is, is in the user's x, y, z. */
export const LIGHT = {
  /** How much light a face turned up must get for three.js to show it in its own colour: a matte face sends
   * back its colour times the light it gets, divided by pi. Measured on the screen, 21 Nov: the astroid's top
   * shows as its own colour. */
  plain: Math.PI,
  /** Of the light that reaches a face turned up: this share is soft light from all of the sky, so no face is
   * lost in the dark; the rest is the sun. */
  skyShare: value('noi.eio.world.light.sky-share'),
  /** The sun: one light from above, and from low y and high x. (Till 22 Nov 2026 its x had the other sign. The
   * user had x turned round; the sun stays where it was.) */
  sunFrom: { x: 6, y: -7, z: 18 },
  /** What a matte face sends back in plain light whatever its colour, as a share of full light: three.js's
   * standard surface keeps a faint grey sheen even at its roughest. Measured on the base tile, 21 Nov. */
  sheen: value('noi.eio.world.light.sheen'),
  /** The top of an element is never shown darker than this share of full light (a dark grey). */
  shownAtLeast: value('noi.eio.world.light.shown-at-least'),
  /** Where one element is looked at alone and can be turned over: a face turned straight down gets this share
   * of plain light, from straight below, so the underside can be seen. It falls on nothing that is turned up
   * or to a side, so the element looks as before from above. MY PICK, not the user's word. */
  underShare: value('noi.eio.world.light.under-share'),
  /** The light's colour, a role of Eidos. */
  colour: role('noi.eio.color.world.light'),
} as const

/** How bright a colour looks, from 0 to 1, by the usual weights of red, green and blue in what an eye sees. */
const brightnessOf = (c: { r: number; g: number; b: number }) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b

/** How much stronger than plain the light must be for a colour's faces to show: 1 for all but very dark ones.
 * Only for looking at one element alone. */
export function lightFor(world: ThreeWorld, colour: string): number {
  const c = new world.three.Color(colour)
  return Math.max(1, LIGHT.shownAtLeast / (brightnessOf(c) + LIGHT.sheen))
}

/** Lights the world: `strength` 1 is plain light. `fromBelow` adds the soft light from straight below, for a
 * thing that can be turned over. `colourOf` gives a colour of Eidos by its token's name, as the page's style
 * has it. Returns what puts the light out. */
export function light(world: ThreeWorld, colourOf: (token: string) => string, strength = 1, fromBelow = false): () => void {
  const THREE = world.three
  const from = LIGHT.sunFrom
  const white = colourOf(LIGHT.colour)
  // how squarely the sun meets a face turned up
  const onTop = from.z / Math.hypot(from.x, from.y, from.z)
  const sky = new THREE.HemisphereLight(white, white, LIGHT.plain * LIGHT.skyShare * strength)
  sky.groundColor.setScalar(0) // the ground gives none of it back
  sky.position.set(0, 0, 1) // the sky is up: z
  const sun = new THREE.DirectionalLight(white, ((LIGHT.plain * (1 - LIGHT.skyShare)) / onTop) * strength)
  sun.position.set(from.x, from.y, from.z)
  world.xyz.add(sky, sun)
  const below = fromBelow ? new THREE.DirectionalLight(white, LIGHT.plain * LIGHT.underShare * strength) : null
  if (below) {
    below.position.set(0, 0, -1) // straight under the thing: z is up
    world.xyz.add(below)
  }
  return () => {
    sky.removeFromParent()
    sun.removeFromParent()
    below?.removeFromParent()
    sky.dispose()
    sun.dispose()
    below?.dispose()
  }
}
