// THE DRONE (22 Nov 2026, issue 127). Two tries came first (a six-sided body with two cuboids, then with four
// cubes). Shown them, the user, with a picture: "I did not like what we made. Let's use the following image as
// reference and use our [astroid] primitive". The picture is a drone seen from above: a body with four points
// and four sides curved inward, a round ring lying in each of the four curved sides, and two short joins from
// each ring to the body.
// FROM THE USER'S WORDS AND PICTURE: the body is our astroid primitive (at its Base size as large and as thick as
// the astroid between four tiles; since 23 Nov it is sized from the drone's own Base size); four rings, one in each curved side, so each
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
// FOUR SIZES (23 Nov 2026, issue 131). The user decided how elements are sized: "a drone will have a scale", "for
// drone, small, default, medium, large can be 0.5, 1, 1.5, and 2", with "Base" as the 1 step's name; "studs should
// have universally one single size", and of the two ways shown, "I also would like to go with A": a larger drone
// carries more studs, as a larger brick does. And: "there is no point in saving individual part sizes of drone".
// So Eidos holds the drone's scale and its Base size (noi.eio.world.drone); every part is a share of the Base size,
// named below as this element's own, and the whole drone at a step is that share of it. The studs keep the one
// size; how many go on the body is as many as fit the room the user's four take at Base (a square 0.6 of the
// body's radius across, two pitches): 1 by 1 at Small (fewer than two by two fit: MY PICK, one stud in the middle),
// 2 by 2 at Base, 3 by 3 at Medium, 4 by 4 at Large. MY PICKS, not the user's word: the Base size stays the 3.68 m
// the drone was made in (whether to round it to 4 m is open); how high it hovers and flies, how far it bobs and how
// wide it circles grow with it, while its times, its lean and its fans' turning do not.
// Every colour is Eidos's.
import type { DroneSetting, DroneState } from '@noi/eio-tokens/components'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role, steps, value } from '../drawing/eidos.ts'
import type { ElementState, Piece, Pieces, Surface, WorldElement } from '../drawing/element.ts'
import { squareOfStuds, studsFitting } from '../drawing/studs.ts'

/** The drone's parts, each as a share of its body's radius or thickness: how far out its rings reach and where
 * their band begins; how thick one join is across (of the body's thickness) and how far it reaches inside the
 * body's curved side; how large a fan is and how thick (of the body's thickness), and how long it takes to turn
 * once, in seconds; how thick the body is; how wide a square the studs may take on top of the body. */
const PART = { ringOuter: 0.84, ringInner: 0.71, joinWidth: 0.5, joinReach: 0.1, fanRadius: 0.55, fanThickness: 0.4, fanTurnEvery: 0.4, thickness: 0.2, studRoom: 0.6 } as const
/** The drone's Base size, Eidos's: how far it runs across, rings included. Its body's radius at Base follows,
 * to the millimetre. */
const BASE_ACROSS = value('noi.eio.world.drone.base-size')
const BASE_RADIUS = Math.round((BASE_ACROSS / (2 * (1 + PART.ringOuter))) * 1000) / 1000
const BLACK: Surface = { ...BASE_TILE.surface }
/** How many studs, in words. */
const COUNTED: Readonly<Record<number, string>> = { 1: 'one', 4: 'four', 9: 'nine', 16: 'sixteen' }
const FAN_SURFACE: Surface = { colour: BASE_TILE.surface.colour, finish: 'glossy', says: 'glossy black' }

/** THE DRONE'S SETTINGS, each by the key Mero holds for it: its scale, the steps Eidos holds (Small, Base, Medium,
 * Large), each a share of its Base size. Offered in one group, Size, as the stage's sizes are. */
export const DRONE_SETTINGS: Record<DroneSetting, { readonly name: string; readonly steps: ReturnType<typeof steps> }> = {
  scale: { name: 'Scale', steps: steps('noi.eio.world.drone.scale') },
}

/** THE DRONE'S STATES at its Base size, each by the key Mero holds for it. The user: "a drone is used to fly around
 * and hover on the different states of it." FROM THE USER'S WORDS: it hovers, and it flies around. MY DESIGN: a
 * third state in which it is landed, and it starts there; every number: how high it hovers and flies and how far
 * it bobs (metres) and how often (seconds), how wide it circles (metres) and how often (seconds), how far it leans
 * (degrees), and how fast its fans turn (a share of their own speed: 0 still, 1 their speed). */
export const DRONE_STATES: Record<DroneState, Omit<ElementState, 'id'>> = {
  landed: { name: 'Landed', says: 'It stands on its place and its fans are still.', spin: 0 },
  hovering: {
    name: 'Hovering',
    says: 'It hangs over its place, rising and sinking a little, its fans turning.',
    lift: 0.8,
    bob: { by: 0.05, every: 2.4 },
    spin: 1,
  },
  flying: {
    name: 'Flying',
    says: 'It flies round its place, leaning into its way, its fans turning faster.',
    lift: 1.2,
    bob: { by: 0.04, every: 1.6 },
    round: { radius: 2.5, every: 7, lean: 12 },
    spin: 1.4,
  },
}

/** A state of the drone at a step of its scale: how high it goes, how far it bobs and how wide it circles grow with
 * it; how often, how far it leans and how fast its fans turn do not. */
function grown(state: Omit<ElementState, 'id'>, factor: number): Omit<ElementState, 'id'> {
  if (factor === 1) return state
  const { lift, bob, round } = state
  return {
    ...state,
    ...(lift === undefined ? {} : { lift: lift * factor }),
    ...(bob === undefined ? {} : { bob: { ...bob, by: bob.by * factor } }),
    ...(round === undefined ? {} : { round: { ...round, radius: round.radius * factor } }),
  }
}

/** The drone at a step of its scale: `factor` times its Base size, its studs one size and as many as fit. */
function droneAt(factor: number): WorldElement & { readonly shape: Pieces } {
  const r = BASE_RADIUS * factor
  const thick = PART.thickness * r
  const RING = { outer: PART.ringOuter * r, inner: PART.ringInner * r }
  /** One join: as thick across as this share of the body's thickness; from the middle of the ring's band to a
   * share of the radius inside the body's curved side. */
  const JOIN = { across: PART.joinWidth * thick, from: (RING.outer + RING.inner) / 2, to: r + PART.joinReach * r }
  const FAN = { radius: PART.fanRadius * r, thick: PART.fanThickness * thick, turnEvery: PART.fanTurnEvery }
  // on top of the body: as many studs a side as fit the room the user's four take at Base
  const STUDS = squareOfStuds(studsFitting(PART.studRoom * r), thick)

  const pieces: Piece[] = [{ name: 'body', shape: { kind: 'astroid', radius: r }, size: { x: 2 * r, y: 2 * r, z: thick }, at: { x: 0, y: 0 } }]
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

  const states: Record<DroneState, Omit<ElementState, 'id'>> = {
    landed: grown(DRONE_STATES.landed, factor),
    hovering: grown(DRONE_STATES.hovering, factor),
    flying: grown(DRONE_STATES.flying, factor),
  }
  const scale = DRONE_SETTINGS.scale
  const step = scale.steps.find(s => s.value === factor)
  const studs = `${COUNTED[STUDS.at.length] ?? STUDS.at.length} ${STUDS.at.length === 1 ? 'stud' : 'studs'}`
  return {
    id: 'drone',
    name: 'Drone',
    says: `Our astroid as its body, a round ring lying in each of its four curved sides with one round join to the body, in each ring a fan that turns, and on top of the body ${studs} that other pieces can be set on.`,
    size: { x: 2 * (r + RING.outer), y: 2 * (r + RING.outer), z: thick + STUDS.height },
    shape: { kind: 'pieces', pieces, says: `the astroid, four round rings, four round joins, four fans, each a small astroid that turns, and ${studs.replace(' stud', ' round stud')} on top of the body` },
    surface: { colour: role('noi.eio.color.text.danger'), finish: 'matte', says: 'matte red, with matte black rings and glossy black fans' },
    studs: STUDS,
    states: Object.entries(states).map(([id, state]) => ({ id, ...state })),
    settings: Object.entries(DRONE_SETTINGS).map(([id, s]) => ({ id, group: 'Size', name: s.name, sets: { what: 'scale' }, steps: s.steps, value: step?.value ?? factor })),
    scaled: droneAt,
  }
}

/** The drone, seen from above as in the user's picture: our astroid as its body, a ring in each curved side; at
 * its Base size, and at any step of its scale (`scaled`). */
export const DRONE: WorldElement & { readonly shape: Pieces } = droneAt(1)
