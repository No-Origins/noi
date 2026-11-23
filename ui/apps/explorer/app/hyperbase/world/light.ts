// THE LIGHT of the world (21 Nov 2026, issue 123 in noi-planning). MY PICK, not the user's word: one sun, from
// above and from low y and high x, and soft light from all of the sky. In plain light a matte face turned up
// shows its own colour as Eidos has it; faces turned away from the sun are darker, which is what shows a
// thing's shape. The same light falls on an element in the gallery and on the land. One difference, measured on
// the screen on 21 Nov: an element looked at alone is lit more when its colour is too dark to show its faces
// (lightFor), so the base tile's top shows as #2c2c2c in the gallery and as #1d1d1d on the land; the astroid's
// top is #9264f0 in both. The lights are put into the stage's `xyz`: where the sun is, is said in the user's
// x, y, z.
import type { World } from './world.ts'

/** The light. Where the sun is, is in the user's x, y, z. */
export const LIGHT = {
  /** How much light a face turned up must get for three.js to show it in its own colour: a matte face sends
   * back its colour times the light it gets, divided by pi. Measured on the screen, 21 Nov: the astroid's top
   * shows as #9264f0, and Eidos's secondary colour is #9262f3. */
  plain: Math.PI,
  /** Of the light that reaches a face turned up: this share is soft light from all of the sky, so no face is
   * lost in the dark; the rest is the sun. */
  skyShare: 0.19,
  /** The sun: one light from above, and from low y and high x. (Till 22 Nov 2026: x -6. The user had x turned
   * round, place.ts; the sun stays where it was, so its x changed its sign.) */
  sunFrom: { x: 6, y: -7, z: 18 },
  /** What a matte face sends back in plain light whatever its colour, as a share of full light: three.js's
   * standard surface keeps a faint grey sheen even at its roughest. Measured on the base tile, 21 Nov. */
  sheen: 0.0093,
  /** The top of an element is never shown darker than this share of full light (a dark grey, #2c2c2c). */
  shownAtLeast: 0.0252,
  /** Where one element is looked at alone and can be turned over: a face turned straight down gets this share
   * of plain light, from straight below, so the underside can be seen. It falls on nothing that is turned up
   * or to a side, so the element looks as before from above. MY PICK, not the user's word. */
  underShare: 0.3,
} as const

/** How much stronger than plain the light must be for a colour's faces to show: 1 for all but very dark ones.
 * Only for looking at one element alone. */
export function lightFor(world: World, colour: string): number {
  const c = new world.three.Color(colour || '#808080')
  const brightness = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
  return Math.max(1, LIGHT.shownAtLeast / (brightness + LIGHT.sheen))
}

/** Lights a stage: `strength` 1 is plain light. `fromBelow` adds the soft light from straight below, for a
 * thing that can be turned over. Returns what puts the light out. */
export function light(world: World, strength = 1, fromBelow = false): () => void {
  const THREE = world.three
  const from = LIGHT.sunFrom
  // how squarely the sun meets a face turned up
  const onTop = from.z / Math.hypot(from.x, from.y, from.z)
  const sky = new THREE.HemisphereLight('#ffffff', '#000000', LIGHT.plain * LIGHT.skyShare * strength)
  sky.position.set(0, 0, 1) // the sky is up: z
  const sun = new THREE.DirectionalLight('#ffffff', ((LIGHT.plain * (1 - LIGHT.skyShare)) / onTop) * strength)
  sun.position.set(from.x, from.y, from.z)
  world.xyz.add(sky, sun)
  const below = fromBelow ? new THREE.DirectionalLight('#ffffff', LIGHT.plain * LIGHT.underShare * strength) : null
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
