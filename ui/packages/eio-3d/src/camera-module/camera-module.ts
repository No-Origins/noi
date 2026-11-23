// THE CAMERA MODULE (22 Nov 2026, issue 127). The user: "Now I think we should move to our next element. And that
// is camera. So the idea that I have is I want to have drones in the world roaming around attached with cameras
// on top of it." Shown four designs, they gave a picture of their own: "Here is the inspiration for a camera
// that I have. Can you build the camera module element?" The picture: on the middle of the drone's body a round
// foot with small lights round it, a short neck, and on it a wide head with round ends that looks to the front:
// a dark face with two lenses side by side, a small light between them, and a strip of light along its top.
// FROM THE USER'S WORDS AND PICTURE: those parts, and that it goes on the drone by the studs (its base has sockets
// on the studs' grid, `sockets`; `fitsOn` says where it then stands).
// MY PICKS, not the user's word, read off the picture: every size below; the lights in the primary colour (the
// picture's are white, which does not show on a white thing in this light); that its front is toward low y, as
// every element's is.
// LIME RINGS (22 Nov 2026). The user: "Can you also add subtle lime rings for the two camera rings?" FROM THE USER'S
// WORDS: a subtle lime ring on each of the two lenses. MY PICK: one thin ring each, lit in the primary colour,
// lying on the lens's front round the glass, thinner than the lens's own band so that it is subtle.
// THE BASE (22 Nov 2026). The user: "the base of the camera module should be a cuboid with all four sides same,
// keeping the same height, but with border radius, and also the bottoms that can fit the studs." FROM THE USER'S
// WORDS: the base is a block whose four sides are the same, as tall as the round foot was, its corners rounded,
// and underneath it has holes the studs go into. MY PICKS: its sides are as long as the studs' square is (as the
// toy's two-by-two brick is); how round its corners are; a hole as wide as a stud and as deep as a stud is tall;
// that the smaller round plate stays on the base, under the neck; lights on each of its four sides.
// RECOLOURED (23 Nov 2026, piece 41): "in camera module, the two cameras part is glossy black, which is nice. I like
// it, but I want rest of the body to be matte black." The body takes the base tile's black and matte finish.
// THROUGH THE CAMERA (23 Nov 2026). The user: "Also add Camera view, I mean, through the camera." FROM THE USER'S
// WORDS: one can look through it. MY PICKS: the eye is mid-way between the two lenses, just before their fronts, so
// nothing of the camera is in its own way; it turns with the head; how wide it sees.
// Every number is Eidos's (noi.eio.world.camera-module), and so is every colour.
import type { CameraModuleState } from '@noi/eio-tokens/components'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role, value } from '../drawing/eidos.ts'
import type { ElementState, Piece, Pieces, Studs, Surface, WorldElement } from '../drawing/element.ts'
import { STUD_GRID, STUDS_A_SIDE, squareOfStuds } from '../drawing/studs.ts'

const v = {
  base: { side: STUDS_A_SIDE * STUD_GRID.pitch, corner: value('noi.eio.world.camera-module.base-corner') * STUD_GRID.pitch, tall: value('noi.eio.world.camera-module.base-height') },
  plate: { radius: value('noi.eio.world.camera-module.plate-radius') * STUD_GRID.pitch, tall: value('noi.eio.world.camera-module.plate-height') },
  neck: { radius: value('noi.eio.world.camera-module.neck-radius'), tall: value('noi.eio.world.camera-module.neck-height') },
  /** The head, seen from the front: so wide, so tall, its ends round; and so deep from front to back. */
  head: { wide: value('noi.eio.world.camera-module.head-width'), tall: value('noi.eio.world.camera-module.head-height'), deep: value('noi.eio.world.camera-module.head-depth') },
  /** The dark face on the head's front, standing `proud` of it. */
  face: { wide: value('noi.eio.world.camera-module.face-width'), tall: value('noi.eio.world.camera-module.face-height'), proud: value('noi.eio.world.camera-module.face-proud') },
  /** The two lenses: their middles `apart`, each a ring with glass in it. */
  lens: {
    apart: value('noi.eio.world.camera-module.lens-apart'),
    outer: value('noi.eio.world.camera-module.lens-outer'),
    inner: value('noi.eio.world.camera-module.lens-inner'),
    proud: value('noi.eio.world.camera-module.lens-proud'),
    glassProud: value('noi.eio.world.camera-module.glass-proud'),
  },
  /** A thin ring of light on each lens's front, round the glass: `wide` from the glass out, `proud` thick. */
  lensRing: { wide: value('noi.eio.world.camera-module.lens-ring-width'), proud: value('noi.eio.world.camera-module.lens-ring-proud') },
  /** The lights on the base's sides (`each` on every side, half a pitch from one to the next), the light between
   * the lenses, and the strip along the head's top. */
  lights: {
    each: value('noi.eio.world.camera-module.base-lights-each'),
    apart: STUD_GRID.pitch / 2,
    wide: value('noi.eio.world.camera-module.base-light-width'),
    tall: value('noi.eio.world.camera-module.base-light-height'),
    proud: value('noi.eio.world.camera-module.base-light-proud'),
    up: value('noi.eio.world.camera-module.base-light-up'),
  },
  bar: { wide: value('noi.eio.world.camera-module.bar-width'), tall: value('noi.eio.world.camera-module.bar-height'), proud: value('noi.eio.world.camera-module.bar-proud') },
  strip: {
    long: value('noi.eio.world.camera-module.strip-length'),
    wide: value('noi.eio.world.camera-module.strip-width'),
    tall: value('noi.eio.world.camera-module.strip-height'),
    forward: value('noi.eio.world.camera-module.strip-forward'),
  },
} as const
const GLASS: Surface = { colour: role('noi.eio.color.world.land'), finish: 'glossy', says: 'glossy black' }
const LIGHT: Surface = { colour: role('noi.eio.color.action.primary'), finish: 'lit', says: 'lit, in the primary colour' }
/** Where the camera module takes the studs of what it is set on: a square of sockets on the studs' grid, each as
 * wide as a stud and as deep as a stud is tall, at its base. */
const SOCKETS: Studs = squareOfStuds(0)

const pieces: Piece[] = (() => {
  const c = v
  const round = (radius: number, tall: number) => ({ shape: { kind: 'slab', cornerRadius: radius } as const, size: { x: 2 * radius, y: 2 * radius, z: tall } })
  const plateUp = c.base.tall
  const square = { x: c.base.side, y: c.base.side }
  const neckUp = plateUp + c.plate.tall
  // the head's middle, as high as the neck's top and half the head; its front and its back, either side of y 0
  const headUp = neckUp + c.neck.tall + c.head.tall / 2
  const [back, front] = [c.head.deep / 2, 0 - c.head.deep / 2]
  const onFace = front - c.face.proud
  const made: Piece[] = [
    // the base is one block drawn as two parts: the lower as deep as the sockets, with a round hole for each
    // (so the holes are open underneath), and the upper closed above them
    { name: 'base', shape: { kind: 'slab', cornerRadius: c.base.corner, holes: SOCKETS.at.map(s => ({ x: s.x, y: s.y, radius: SOCKETS.radius })) }, size: { ...square, z: SOCKETS.height }, at: { x: 0, y: 0 } },
    { name: 'base top', shape: { kind: 'slab', cornerRadius: c.base.corner }, size: { ...square, z: c.base.tall - SOCKETS.height }, at: { x: 0, y: 0 }, up: SOCKETS.height },
    { name: 'plate', ...round(c.plate.radius, c.plate.tall), at: { x: 0, y: 0 }, up: plateUp },
    { name: 'neck', ...round(c.neck.radius, c.neck.tall), at: { x: 0, y: 0 }, up: neckUp },
    { name: 'head', part: 'head', shape: { kind: 'slab', cornerRadius: c.head.tall / 2 }, size: { x: c.head.wide, y: c.head.tall, z: c.head.deep }, at: { x: 0, y: back }, up: headUp, faces: 'front' },
    { name: 'face', part: 'head', shape: { kind: 'slab', cornerRadius: c.face.tall / 2 }, size: { x: c.face.wide, y: c.face.tall, z: c.face.proud }, at: { x: 0, y: front }, up: headUp, faces: 'front', surface: GLASS },
    { name: 'light between the lenses', part: 'head', shape: { kind: 'slab', cornerRadius: c.bar.tall / 2 }, size: { x: c.bar.wide, y: c.bar.tall, z: c.bar.proud }, at: { x: 0, y: onFace }, up: headUp, faces: 'front', surface: LIGHT },
    { name: 'light along the top', part: 'head', shape: { kind: 'slab', cornerRadius: c.strip.wide / 2 }, size: { x: c.strip.long, y: c.strip.wide, z: c.strip.tall }, at: { x: 0, y: 0 - c.strip.forward }, up: headUp + c.head.tall / 2, surface: LIGHT },
  ]
  for (const [n, side] of ([-1, 1] as const).entries()) {
    const at = { x: (side * c.lens.apart) / 2, y: onFace }
    made.push({ name: `lens ${n + 1}`, part: 'head', shape: { kind: 'ring', outer: c.lens.outer, inner: c.lens.inner }, size: { x: 2 * c.lens.outer, y: 2 * c.lens.outer, z: c.lens.proud }, at, up: headUp, faces: 'front', surface: GLASS })
    made.push({ name: `lens ring ${n + 1}`, part: 'head', shape: { kind: 'ring', outer: c.lens.inner + c.lensRing.wide, inner: c.lens.inner }, size: { x: 2 * (c.lens.inner + c.lensRing.wide), y: 2 * (c.lens.inner + c.lensRing.wide), z: c.lensRing.proud }, at: { x: at.x, y: at.y - c.lens.proud }, up: headUp, faces: 'front', surface: LIGHT })
    made.push({ name: `glass ${n + 1}`, part: 'head', shape: { kind: 'slab', cornerRadius: c.lens.inner }, size: { x: 2 * c.lens.inner, y: 2 * c.lens.inner, z: c.lens.glassProud }, at, up: headUp, faces: 'front', surface: GLASS })
  }
  // the lights on the base's four sides: each a small upright bar half in the side and half out of it
  for (let side = 0; side < 4; side++) {
    const turn = side * 90
    // which way this side faces, and the way along it
    const out = ([[1, 0], [0, 1], [-1, 0], [0, -1]] as const)[side]!
    const along = ([[0, 1], [-1, 0], [0, -1], [1, 0]] as const)[side]!
    for (let n = 0; n < c.lights.each; n++) {
      const off = (n - (c.lights.each - 1) / 2) * c.lights.apart
      made.push({
        name: `base light ${side * c.lights.each + n + 1}`,
        shape: { kind: 'slab', cornerRadius: 0 },
        size: { x: 2 * c.lights.proud, y: c.lights.wide, z: c.lights.tall },
        at: { x: (out[0] * c.base.side) / 2 + along[0] * off, y: (out[1] * c.base.side) / 2 + along[1] * off },
        turn,
        up: c.lights.up,
        surface: LIGHT,
      })
    }
  }
  return made
})()

/** THE CAMERA MODULE'S STATES, each by the key Mero holds for it. The user: "the camera is used to view". FROM THE
 * USER'S WORDS: a state in which it views. MY DESIGN: that viewing is its head turning slowly from side to side
 * on its neck (the head, its face, lenses and lights are one part, `head`); a state of rest, in which it starts;
 * the numbers. */
export const CAMERA_MODULE_STATES: Record<CameraModuleState, Omit<ElementState, 'id'>> = {
  resting: { name: 'Resting', says: 'Its head is still, looking to the front.' },
  viewing: {
    name: 'Viewing',
    says: 'Its head turns slowly from side to side, looking round.',
    sweep: { part: 'head', by: value('noi.eio.world.camera-module.sweep'), every: value('noi.eio.world.camera-module.sweep-every') },
  },
}

/** The camera module: a square base that goes on four studs, a neck, and a head that looks to the front. */
export const CAMERA_MODULE: WorldElement & { readonly shape: Pieces; readonly sockets: Studs } = {
  id: 'camera-module',
  name: 'Camera module',
  says: 'A square base with rounded corners and lights on its sides, a short neck, and a wide head that looks to the front with two lenses side by side, each with a thin ring of light round it. Underneath, the base has four sockets that go on four studs.',
  // along y it reaches as far as the base and the lights that stand out of the base's sides
  size: { x: v.head.wide, y: v.base.side + 2 * v.lights.proud, z: v.base.tall + v.plate.tall + v.neck.tall + v.head.tall + v.strip.tall },
  shape: { kind: 'pieces', pieces, says: 'a square base with rounded corners and four sockets underneath, a round plate, a neck, a head with round ends facing the front, a dark face with two lenses, a thin ring of light round each lens, and small lights' },
  surface: { ...BASE_TILE.surface, says: 'matte black, with glossy black glass and lights in the primary colour' },
  sockets: SOCKETS,
  lookOut: {
    at: { x: 0, y: 0 - v.head.deep / 2 - v.face.proud - v.lens.proud - v.lensRing.proud - value('noi.eio.world.camera-module.eye-clearance'), z: v.base.tall + v.plate.tall + v.neck.tall + v.head.tall / 2 },
    part: 'head',
    sees: value('noi.eio.world.camera-module.sees'),
  },
  states: Object.entries(CAMERA_MODULE_STATES).map(([id, state]) => ({ id, ...state })),
}
