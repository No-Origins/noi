// THE DRONE (22 Nov 2026, issue 127). Two tries came first (a six-sided body with two cuboids, then with four
// cubes). Shown them, the user, with a picture: "I did not like what we made. Let's use the following image as
// reference and use our [astroid] primitive". The picture is a drone seen from above: a body with four points
// and four sides curved inward, a round ring lying in each of the four curved sides, and two short joins from
// each ring to the body.
// FROM THE USER'S WORDS AND PICTURE: the body is our astroid primitive itself (its shape and its thickness are
// taken from ASTROID, so a change to it changes the drone); four rings, one in each curved side, so each
// ring's middle is the middle of the circle that side is a quarter of; a gap between ring and body.
// MY PICKS, not the user's word, read off the picture as shares of the astroid's radius: how large a ring is
// and how wide its band; that rings are as thick as the astroid.
// ONE JOIN (23 Nov 2026, issue 127, piece 42). The user: "Keep this red, but there are connectors between the ring
// fans and the body, which are glitching. So I think what I want to do is instead of two connectors, let's make it
// one, and it has to be like a cylinder, smaller than the height of the body and wing circle." FROM THE USER'S
// WORDS: one join for each ring, a cylinder, thinner than the body and the ring are thick. MY PICKS, not the
// user's word: it lies along the line from the ring's middle to the body's middle; it is half as thick across as
// the body and ring; its middle is at half their thickness; it starts in the ring's band (half-way between its
// inner and outer edge) and ends a tenth of a radius inside the body's curved side; matte black with the rings.
// THE FANS (22 Nov 2026). The user: "I want you to figure out the fans for the drone." So all of this is MY
// DESIGN, none of it the user's word: a fan is a small astroid lying in a ring's opening and turning about the
// ring's middle, so that the drone is made of astroids and rings and nothing else, and a fan has four blades.
// Its points stop short of the ring; it is thinner than the ring, so it lies below the ring's rim; fans in
// neighbouring rings turn opposite ways, as a drone's do (which way each turns is this element's own). Then:
// "Amazing. Can you also increase the fan speed? And reduce the Font size a little bit more." ("Font size" read as
// "fan size", dictated.) MY PICK: twice as fast, and a little smaller.
// RECOLOURED (23 Nov 2026, issue 127, piece 41). The user: "I'm going with black for the world ... For the drone, I
// want the w- wings to be matte black. Sorry, glossy black, and the body to be red. Maybe we can choose something
// like crimson red, and the circles around the fans can be matte black." READ AS: wings = the four fans (glossy
// black, as the camera's lenses); body = the astroid and its four studs (red); circles around the fans = the four
// rings (matte black, as the base tile). MY PICKS, not the user's word: the joins go matte black with the rings; the
// body is matte; Eidos has no crimson, so the red is its nearest role.
// THE STUDS ON THE BODY (22 Nov 2026). The user: the drone is a primitive that later pieces attach to, by "a Lego
// style attachment setup on top of the body"; then "I would have preferred 4 as a grid". The studs are the one
// grid's (drawing/studs.ts), centred on the drone's middle, on top of the body.
// Every number is Eidos's (noi.eio.world.drone), and so is every colour.
import type { DroneState } from '@noi/eio-tokens/components'
import { ASTROID } from '../astroid/astroid.ts'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role, value } from '../drawing/eidos.ts'
import type { ElementState, Piece, Pieces, Surface, WorldElement } from '../drawing/element.ts'
import { squareOfStuds } from '../drawing/studs.ts'

const r = ASTROID.shape.radius
const thick = ASTROID.size.z
const RING = { outer: value('noi.eio.world.drone.ring-outer') * r, inner: value('noi.eio.world.drone.ring-inner') * r }
/** One join: as thick across as this share of the body's thickness; from the middle of the ring's band to a
 * share of the radius inside the body's curved side. */
const JOIN = { across: value('noi.eio.world.drone.join-width') * thick, from: (RING.outer + RING.inner) / 2, to: r + value('noi.eio.world.drone.join-reach') * r }
const FAN = { radius: value('noi.eio.world.drone.fan-radius') * r, thick: value('noi.eio.world.drone.fan-thickness') * thick, turnEvery: value('noi.eio.world.drone.fan-turn-every') }
const BLACK: Surface = { ...BASE_TILE.surface }
const FAN_SURFACE: Surface = { colour: BASE_TILE.surface.colour, finish: 'glossy', says: 'glossy black' }
const STUDS = squareOfStuds(thick) // on top of the body

const pieces: Piece[] = [{ name: 'body', shape: ASTROID.shape, size: ASTROID.size, at: { x: 0, y: 0 } }]
// each stud: a round peg (a slab whose corners are rounded all the way), standing where the studs' data says
STUDS.at.forEach((stud, n) => {
  pieces.push({
    name: `stud ${n + 1}`,
    shape: { kind: 'slab', cornerRadius: STUDS.radius },
    size: { x: 2 * STUDS.radius, y: 2 * STUDS.radius, z: STUDS.height },
    at: { x: stud.x, y: stud.y },
    up: stud.z,
  })
})
;([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sy], n) => {
  const middle = { x: sx * r, y: sy * r }
  pieces.push({
    name: `ring ${n + 1}`,
    shape: { kind: 'ring', ...RING },
    size: { x: 2 * RING.outer, y: 2 * RING.outer, z: thick },
    at: middle,
    surface: BLACK,
  })
  pieces.push({
    name: `fan ${n + 1}`,
    shape: { kind: 'astroid', radius: FAN.radius },
    size: { x: 2 * FAN.radius, y: 2 * FAN.radius, z: FAN.thick },
    at: middle,
    surface: FAN_SURFACE,
    // neighbouring fans turn opposite ways
    spin: { turnEvery: FAN.turnEvery, way: sx * sy > 0 ? 1 : -1 },
  })
  // the way from the ring's middle to the drone's middle, in degrees from x toward y
  const inward = (Math.atan2(0 - sy, 0 - sx) * 180) / Math.PI
  const radians = (inward * Math.PI) / 180
  // ONE join, a round rod lying along that way: a round slab stood on its end (faces 'front') and turned so its
  // length runs along the diagonal; its middle at half the thickness of the body and ring, so it lies inside both
  pieces.push({
    name: `join ${n + 1}`,
    shape: { kind: 'slab', cornerRadius: JOIN.across / 2 },
    size: { x: JOIN.across, y: JOIN.across, z: JOIN.to - JOIN.from },
    at: { x: middle.x + JOIN.from * Math.cos(radians), y: middle.y + JOIN.from * Math.sin(radians) },
    up: thick / 2,
    faces: 'front',
    turn: inward + 90,
    surface: BLACK,
  })
})

/** THE DRONE'S STATES, each by the key Mero holds for it. The user: "a drone is used to fly around and hover on the
 * different states of it." FROM THE USER'S WORDS: it hovers, and it flies around. MY DESIGN: a third state in which
 * it is landed, and it starts there; every number (how high, how fast, how far round, how much it leans). */
export const DRONE_STATES: Record<DroneState, Omit<ElementState, 'id'>> = {
  landed: { name: 'Landed', says: 'It stands on its place and its fans are still.', spin: value('noi.eio.world.drone.spin-landed') },
  hovering: {
    name: 'Hovering',
    says: 'It hangs over its place, rising and sinking a little, its fans turning.',
    lift: value('noi.eio.world.drone.hovering-lift'),
    bob: { by: value('noi.eio.world.drone.hovering-bob'), every: value('noi.eio.world.drone.hovering-bob-every') },
    spin: value('noi.eio.world.drone.spin-hovering'),
  },
  flying: {
    name: 'Flying',
    says: 'It flies round its place, leaning into its way, its fans turning faster.',
    lift: value('noi.eio.world.drone.flying-lift'),
    bob: { by: value('noi.eio.world.drone.flying-bob'), every: value('noi.eio.world.drone.flying-bob-every') },
    round: { radius: value('noi.eio.world.drone.flying-circle'), every: value('noi.eio.world.drone.flying-circle-every'), lean: value('noi.eio.world.drone.flying-lean') },
    spin: value('noi.eio.world.drone.spin-flying'),
  },
}

/** The drone, seen from above as in the user's picture: our astroid as its body, a ring in each curved side. */
export const DRONE: WorldElement & { readonly shape: Pieces } = {
  id: 'drone',
  name: 'Drone',
  says: 'Our astroid as its body, a round ring lying in each of its four curved sides with one round join to the body, in each ring a fan that turns, and on top of the body four studs that other pieces can be set on.',
  size: { x: 2 * (r + RING.outer), y: 2 * (r + RING.outer), z: thick + STUDS.height },
  shape: { kind: 'pieces', pieces, says: 'the astroid, four round rings, four round joins, four fans, each a small astroid that turns, and four round studs on top of the body' },
  surface: { colour: role('noi.eio.color.text.danger'), finish: 'matte', says: 'matte red, with matte black rings and glossy black fans' },
  studs: STUDS,
  states: Object.entries(DRONE_STATES).map(([id, state]) => ({ id, ...state })),
}
