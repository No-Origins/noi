// THE LAND, HELD AS DATA (21 Nov 2026, issue 117 in noi-planning; built under issue 123). The user: "it has to be
// a state machine built on top of primitives ... nothing can be just subjective. Everything has to be
// navigational units that can be accessed by code." So everything about the land is one piece of data, the
// state; code reads it, and changes it only by naming a change; the picture (drawLand.ts) follows it and holds
// nothing of its own. Nothing here knows three.js.
//
// DECIDED BY THE USER: 200 m across, one step one metre. Till 22 Nov 2026 it was a square that ran from -100 to
// 100 each way with 0, 0 in the middle; since then, at the user's word (place.ts tells it): along x from -100
// at the left side to 100 at the right, and along y from 0 at the beginning to the end, so x 0, y 0 is the
// middle of the beginning's side; and the end is at y 600 ("maybe we can make y up to 600"). The edge can move
// out later without changing any address; the coordinates are seen in four ways, all
// kept: lines on the ground (every metre faint, every 10 m stronger, the two axes in colour), numbers along the
// four edges every 10 m, an upright marker at every 10 m crossing with its place in words when near, and the
// place under the pointer in words.
// NOT DECIDED, carried from the brainstorm's try as picks: everything in PICKS, and where the eye starts.
//
// LAID ON THE LAND at the user's word ("Lay them on the land", 21 Nov 2026): a base tile on every 10 m by 10 m
// section, and an astroid wherever four tiles meet. Each is a thing in the land's data: which element it is,
// and the place it lies on by the middle of its base.
//
// THE LAND'S NUMBERS ARE EIDOS'S (23 Nov 2026): how far it runs is the base platform's (noi.eio.world.base-platform),
// how its coordinates are marked is noi.eio.world.coordinates, and how it is seen is noi.eio.world.isometric; the
// elements laid on it are @noi/eio-3d's. Which side is which, and the places the user laid stages on, are the
// land's own.
import { ASTROID, BASE_PLATFORM_MEASURES, BASE_TILE, STAGE, covers, elementById, sizedBy, value, type WorldElement } from '@noi/eio-3d'
import { at, between, readPlace, standsOn, toThree, writePlace, written, type Place, type Size, type Span } from './place.ts'

/** Half of how far the land runs along x: from -HALF to HALF. 200 m across at first (the user, 21 Nov 2026);
 * THE USER, 23 Nov 2026 (issue 127, piece 49): "the initial idea for base styles I had was that we will only place
 * elements ... to snap onto the tiles ... if there are only 21 tiles in a row, so that becomes odd, and then we'll
 * have one column for the center ... our x0 and y0 can always pass through the center of the center column." So
 * the land is 21 tiles across, 210 m: x 0 runs down the middle of the middle column, and the tiles' middles are
 * on x 0, 10, 20 and so on, where things are said to stand. */
export const HALF = BASE_PLATFORM_MEASURES.width / 2
/** How far the land runs along y: from 0, the beginning's side, to LONG, the end's. THE USER, 22 Nov 2026: "maybe
 * we can make y up to 600." Till then the land was a square, and y ran to 200. */
export const LONG = BASE_PLATFORM_MEASURES.length

/** How large a land is: `half`, half of how far it runs along x (from -half to half); `long`, how far it runs
 * along y (from 0 at the beginning's side to `long` at the end's). */
export interface LandSize {
  readonly half: number
  readonly long: number
}
export const SIZE: LandSize = { half: HALF, long: LONG }

/** How far a land of this size runs: along x and along y, each from its lowest number to its highest. */
export function runs(size: LandSize = SIZE): { readonly x: readonly [number, number]; readonly y: readonly [number, number] } {
  return { x: [0 - size.half, size.half], y: [0, size.long] }
}

/** The middle of a land of this size. */
export function middleOf(size: LandSize = SIZE): Place {
  return at(0, size.long / 2)
}
/** The stronger lines, the numbers on the edges and the upright markers come every this many metres (the user's
 * choice of the four ways, each of them every 10 m). */
export const EVERY = value('noi.eio.world.coordinates.every')

/** The four ways of seeing the coordinates, all kept by the user ("All four"): the lines on the ground, the
 * numbers along the four edges, the upright markers at the 10 m crossings, the place under the pointer. */
export const WAYS = ['lines', 'edgeNumbers', 'markers', 'pointer'] as const
export type Way = (typeof WAYS)[number]

/** What can be shown and hidden on its own: each of the four ways, three parts of the lines that go off
 * by themselves, and the names of the land's four sides. `axes`: the two axes in colour (the x axis and the
 * y axis); with them off, the lines along x 0 and y 0 are drawn like every other 10 m line. `metreLines`: the
 * faint lines every metre; with them off, the stronger lines every 10 m are still there. `edgeLine`: the line
 * round the edge of the land. (`lines` itself is every line on the ground, the 1 m and the 10 m ones.)
 * `sideNames`: the names of the four sides (SIDES, below). */
export const SHOWN = [...WAYS, 'axes', 'metreLines', 'edgeLine', 'sideNames'] as const
export type Shown = (typeof SHOWN)[number]

/** WHAT THE USER CALLS THE MARKERS (21 Nov 2026): "By markers, I meant x and y axis, and at the same time, all
 * the numbers on x and y axis." And, asked whether the upright markers at the crossings go with them: "I mean,
 * along with the previous markers which you also added to the toggle." And then: "along with all the 1 meter X
 * and Y lines too." And, asked whether the 10 m lines go off too: "Those markers too". So, all by the user's
 * word: the two axes in colour, the numbers along the edges, the upright markers at the crossings with their
 * words, the lines every metre, and the lines every 10 m (`lines` is every line on the ground). MY READING, not
 * asked: the line round the land's edge goes with them; "those" answered a sentence that named it too.
 * And of the names of the land's four sides (22 Nov 2026): "These are just markers, part of the markers".
 * What is left on is the place under the pointer, in words.
 * (In this file `markers` alone, as one of the four ways, is still those upright ones.) */
export const USERS_MARKERS: readonly Shown[] = ['axes', 'edgeNumbers', 'markers', 'metreLines', 'lines', 'edgeLine', 'sideNames']

/** THE FOUR SIDES OF THE LAND, BY NAME (22 Nov 2026, issue 127). The user: "I want us to have pointers for the
 * platform, the world base that we built, like the beginning, the end, the left and right of the beginning. So
 * these are just markers. These are not part of the world. These are just markers, part of the markers, so
 * that I can also point out where to put things."
 * So each side of the land has a name, shown as a word just outside it. A name is a marker: it goes off and on
 * with the markers, and it is not a thing laid on the land.
 * MY READING, not the user's word: four names, one for each side; the beginning is where the way starts, and
 * the end is the side across from it.
 * SINCE 22 Nov 2026, BY THE USER'S CHOICE ("Both": place.ts tells it): the beginning is the side along y 0 and
 * the end the side along y 200; the left side is the one on the left of the picture, along x -100, and the
 * right side the one on its right, along x 100. `toward` says which way a side lies from the middle of the
 * land, one step along x or y. */
export interface Side {
  readonly id: 'beginning' | 'end' | 'left' | 'right'
  readonly name: string
  readonly toward: { readonly x: -1 | 0 | 1; readonly y: -1 | 0 | 1 }
}

export const SIDES: readonly Side[] = [
  { id: 'beginning', name: 'Beginning', toward: { x: 0, y: -1 } },
  { id: 'end', name: 'End', toward: { x: 0, y: 1 } },
  { id: 'left', name: 'Left', toward: { x: -1, y: 0 } },
  { id: 'right', name: 'Right', toward: { x: 1, y: 0 } },
]

const sideOf = (id: Side['id']): Side => SIDES.find(side => side.id === id)!

/** THE VIEW IS ISOMETRIC (22 Nov 2026, issue 127). The user: "The next change is fix the default view to
 * isometric view, and the scroll should basically move the world from beginning to end direction." (With a
 * site as inspiration, y-n10.com: a fixed isometric view of a dark ground, which the scroll slides along.)
 * Isometric: the eye sees a thing as large far as near (world.ts), and looks along a line that goes as many
 * metres along x as along y as down, so the land's three directions are drawn equally long.
 * WHICH WAY THE WAY RUNS IN THE PICTURE, DECIDED BY THE USER (22 Nov 2026). Shown the way running up the
 * picture and, beside it, running down as on that site, and asked which: "Down, like reference". So the
 * beginning is at the upper right of the picture and the end at the lower left, and scrolling on moves the
 * world up and to the right, as a page moves. The land is seen from the end's side. And then, by the user's
 * choice of the numbers ("Both"), x was turned round so that the left side is on the left of the picture, at
 * its upper left, and the right side at its lower right. So `off`, the corner of the land the eye stands off
 * (the one nearest the bottom of the picture), is where the end meets the right side: the eye stands the same
 * number of metres on along x, on along y and up.
 * MY PICK, not the user's word: `away`, how many metres the eye stands back along each of the three directions
 * (with this eye, how far it stands changes nothing in the picture). */
export const ISOMETRIC: { readonly off: readonly [Side['id'], Side['id']]; readonly away: number } = {
  off: ['end', 'right'],
  away: value('noi.eio.world.isometric.eye-away'),
}

/** The isometric sight of a place: the eye looks at it from ISOMETRIC.away metres back along x, along y and up,
 * off the corner ISOMETRIC.off names. */
export function isometricOver(place: Place): { from: Place; at: Place } {
  const [a, b] = [sideOf(ISOMETRIC.off[0]).toward, sideOf(ISOMETRIC.off[1]).toward]
  const back = { x: (a.x + b.x) * ISOMETRIC.away, y: (a.y + b.y) * ISOMETRIC.away, z: ISOMETRIC.away }
  return { from: at(place.x + back.x, place.y + back.y, place.z + back.z), at: place }
}

/** Numbers the user has not chosen: the brainstorm's try had them, and they are carried until the user says. */
export interface Picks {
  /** How tall an upright marker is, in metres. */
  readonly markerHeight: number
  /** How wide an upright marker is, each way, in metres. */
  readonly markerWidth: number
  /** How high above its crossing a marker's words are, in metres. */
  readonly wordsAbove: number
  /** A marker's words show only while the eye is nearer than this, in metres. */
  readonly wordsWithin: number
  /** How far outside the edge the numbers stand, in metres. */
  readonly numbersOut: number
  /** How many decimals the place under the pointer is written with. */
  readonly pointerDecimals: number
  /** How far outside the edge the name of a side stands, in metres: clear of the numbers along the edge. */
  readonly namesOut: number
  /** The picture holds the land from its left edge to its right edge, and this many metres more beyond each
   * (so the numbers along those edges are seen too). */
  readonly viewMargin: number
  /** How far the world moves in the picture for the scroll: 1 moves it as many dots as were scrolled, as a
   * page moves. */
  readonly scrollGain: number
}

export const PICKS: Picks = {
  markerHeight: value('noi.eio.world.coordinates.marker-height'),
  markerWidth: value('noi.eio.world.coordinates.marker-width'),
  wordsAbove: value('noi.eio.world.coordinates.words-above'),
  wordsWithin: value('noi.eio.world.coordinates.words-within'),
  // 4 m till 22 Nov 2026: in the isometric view a number 4 m out lay under the nearest marker's words
  numbersOut: value('noi.eio.world.coordinates.numbers-out'),
  pointerDecimals: value('noi.eio.world.coordinates.pointer-decimals'),
  namesOut: value('noi.eio.world.coordinates.names-out'),
  viewMargin: value('noi.eio.world.isometric.margin'),
  scrollGain: value('noi.eio.world.isometric.scroll-gain'),
}

/** A thing laid on the land: an element of the world (by its id), on a place by the middle of its base. */
export interface Thing {
  readonly element: string
  readonly at: Place
  /** For an element whose size can be chosen (the stage): the sizes chosen for this one, along x, along y and
   * up; the rest are the element's own. Left out, it is the element as it is made. */
  readonly size?: Partial<Size>
}

/** The element a thing is, in the size chosen for it. */
export function elementOf(t: Thing): WorldElement | null {
  const e = elementById(t.element)
  return e && t.size ? (sizedBy(e, t.size) ?? e) : e
}

/** Everything about the land, at one moment. */
export interface LandState {
  /** Half of how far the land runs along x, in metres: from -half to half. */
  readonly half: number
  /** How far the land runs along y, in metres: from 0 at the beginning's side to `long` at the end's. */
  readonly long: number
  /** Which of the four ways of seeing the coordinates are shown. */
  readonly seen: Readonly<Record<Shown, boolean>>
  /** The place on the ground under the pointer, or null when the pointer is not over the land. */
  readonly pointer: Place | null
  /** The eye: where it is, and the place it looks at. */
  readonly eye: { readonly from: Place; readonly at: Place }
  /** The things laid on the land. */
  readonly things: readonly Thing[]
  readonly picks: Picks
}

/** The land as it starts: all four ways shown, and the whole land laid. The eye starts in the isometric view
 * (the user: "fix the default view to isometric view"), looking at the middle of the beginning's side: where
 * the way from the beginning to the end starts (MY PICK; till 22 Nov it stood at x 0, y -230, z 160 and looked
 * at 0, 0, with far things smaller). */
export function startOfLand(): LandState {
  return frozen({
    half: HALF,
    long: LONG,
    seen: { lines: true, edgeNumbers: true, markers: true, pointer: true, axes: true, metreLines: true, edgeLine: true, sideNames: true },
    pointer: null,
    eye: isometricOver(sideMiddle('beginning', SIZE)),
    things: covering(SIZE),
    picks: PICKS,
  })
}

/** A place given to a change: as data, or in words as the user writes it. */
export type Said = Place | string

/** Every change the land can take, by name. There is no other way to change it. */
export type Change =
  | { what: 'show'; way: Shown; on: boolean } // show or hide one of the four ways, or one part of the lines
  | { what: 'markers'; on: boolean } // show or hide all the user calls the markers, together
  | { what: 'point'; at: Said | null } // the pointer is over this place, or over none
  | { what: 'look'; from: Said; at: Said } // the eye goes here and looks there
  | { what: 'travel'; by: number } // the eye goes this many metres toward the end (less than 0: toward the beginning), looking the same way
  | { what: 'edge'; half?: number; long?: number } // the edge moves: the land runs from -half to half along x, from 0 to long along y
  | { what: 'lay'; element: string; at: Said; size?: Partial<Size> } // one element is laid on a place, in the size chosen for it when it has one
  | { what: 'lift'; at: Said; element?: string } // what lies on a place is taken away (one element, or all)
  | { what: 'cover' } // the whole land is laid: a tile on every section, an astroid wherever four tiles meet
  | { what: 'clear' } // everything laid is taken away
  | { what: 'pick'; name: keyof Picks; value: number } // one of the numbers the user has not chosen yet

function frozen<T>(value: T): T {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const part of Object.values(value)) frozen(part)
    Object.freeze(value)
  }
  return value
}

function placeOf(said: Said): Place {
  if (typeof said === 'string') {
    const p = readPlace(said)
    if (!p) throw new Error(`"${said}" is not a place. A place is written "x 10, y 15", and "x 10, y 15, z 3" off the ground.`)
    return p
  }
  if (!said || ![said.x, said.y, said.z].every(Number.isFinite)) throw new Error('A place needs three numbers: x, y and z.')
  return at(said.x, said.y, said.z)
}

// Two places are the same when they are nearer than a thousandth of a millimetre: sums done by the picture
// must not count as a move.
const same = (a: Place | null, b: Place | null) => (a === null || b === null ? a === b : between(a, b) < 1e-6)

/** Whether any of what the user calls the markers is shown. */
export function markersShown(s: LandState): boolean {
  return USERS_MARKERS.some(part => s.seen[part])
}

/** Whether a place is over the land: the edge itself is on it. */
export function onLand(p: Place, size: LandSize = SIZE): boolean {
  const { x, y } = runs(size)
  return p.x >= x[0] && p.x <= x[1] && p.y >= y[0] && p.y <= y[1]
}

/** The middle of one side of a land of this size. */
export function sideMiddle(id: Side['id'], size: LandSize = SIZE): Place {
  const [m, toward] = [middleOf(size), sideOf(id).toward]
  return at(m.x + toward.x * size.half, m.y + (toward.y * size.long) / 2)
}

/** The land after a change. The same state comes back when the change changes nothing; a change that cannot be
 * made throws, saying why in plain words, and the land stays as it was. */
export function changed(s: LandState, c: Change): LandState {
  switch (c.what) {
    case 'show': {
      if (!SHOWN.includes(c.way)) throw new Error(`There is no way of seeing called "${String(c.way)}". They are: ${SHOWN.join(', ')}.`)
      if (typeof c.on !== 'boolean') throw new Error('A way of seeing is shown (true) or hidden (false).')
      return s.seen[c.way] === c.on ? s : frozen({ ...s, seen: { ...s.seen, [c.way]: c.on } })
    }
    case 'markers': {
      if (typeof c.on !== 'boolean') throw new Error('The markers are shown (true) or hidden (false).')
      if (USERS_MARKERS.every(part => s.seen[part] === c.on)) return s
      return frozen({ ...s, seen: { ...s.seen, ...Object.fromEntries(USERS_MARKERS.map(part => [part, c.on])) } })
    }
    case 'point': {
      const said = c.at === null ? null : placeOf(c.at)
      // the pointer is on the ground, and only while it is over the land
      const pointer = said && onLand(said, s) ? at(said.x, said.y) : null
      return same(pointer, s.pointer) ? s : frozen({ ...s, pointer })
    }
    case 'look': {
      const eye = { from: placeOf(c.from), at: placeOf(c.at) }
      if (same(eye.from, eye.at)) throw new Error('The eye cannot look at the place it is in.')
      return same(eye.from, s.eye.from) && same(eye.at, s.eye.at) ? s : frozen({ ...s, eye })
    }
    case 'travel': {
      if (!Number.isFinite(c.by)) throw new Error('The eye travels a number of metres: more than 0 toward the end, less than 0 toward the beginning.')
      // from the beginning's side to the end's and no farther: the place the eye looks at stays between the two
      const end = sideOf('end').toward
      const [along, reach] = [wayAlong(s), wayReach(s)]
      const step = Math.min(reach, Math.max(-reach, along + c.by)) - along
      if (Math.abs(step) < 1e-9) return s
      const on = (p: Place) => at(p.x + step * end.x, p.y + step * end.y, p.z)
      return frozen({ ...s, eye: { from: on(s.eye.from), at: on(s.eye.at) } })
    }
    case 'edge': {
      if (c.half === undefined && c.long === undefined) throw new Error('Say how far the land runs: half (along x, each way from x 0), long (along y, from the beginning), or both.')
      const size: LandSize = { half: c.half ?? s.half, long: c.long ?? s.long }
      // across, a whole and odd number of tiles, so one column has x 0 down its middle (piece 49); along, a whole number
      const [across, along] = [(2 * size.half) / BASE_TILE.size.x, size.long / BASE_TILE.size.y]
      if (!(Number.isInteger(across) && across % 2 === 1)) throw new Error(`The land is an odd number of tiles across, so that x 0 runs down the middle of one: half 105, 115, 125 and so on.`)
      if (!(Number.isInteger(along) && along > 0)) throw new Error(`The land is a whole number of tiles long: ${BASE_TILE.size.y}, ${2 * BASE_TILE.size.y}, ${3 * BASE_TILE.size.y} m and so on.`)
      if (size.half === s.half && size.long === s.long) return s
      const past = s.things.find(t => !fits(t, size))
      if (past) throw new Error(`The edge cannot come in to x ${size.half}, y ${size.long}: the ${thingWords(past)} would reach past it.`)
      return frozen({ ...s, ...size, pointer: s.pointer && onLand(s.pointer, size) ? s.pointer : null })
    }
    case 'lay': {
      const element = elementById(c.element)
      if (!element) throw new Error(`There is no element called "${String(c.element)}".`)
      if (c.size && !element.sized) throw new Error(`The size of the ${element.name.toLowerCase()} cannot be chosen.`)
      const thing: Thing = c.size ? { element: element.id, at: placeOf(c.at), size: { ...c.size } } : { element: element.id, at: placeOf(c.at) }
      if (thing.at.z < 0) throw new Error('Nothing lies under the ground.')
      if (!fits(thing, s)) throw new Error(`The ${thingWords(thing)} would reach past the edge of the land.`)
      if (s.things.some(t => t.element === thing.element && same(t.at, thing.at))) return s
      return frozen({ ...s, things: [...s.things, thing] })
    }
    case 'lift': {
      const from = placeOf(c.at)
      const left = s.things.filter(t => !(same(t.at, from) && (c.element === undefined || t.element === c.element)))
      return left.length === s.things.length ? s : frozen({ ...s, things: left })
    }
    case 'cover': {
      const things = covering(s)
      const is = new Set(s.things.map(lies))
      return things.length === s.things.length && things.every(t => is.has(lies(t))) ? s : frozen({ ...s, things })
    }
    case 'clear':
      return s.things.length === 0 ? s : frozen({ ...s, things: [] })
    case 'pick': {
      if (!(c.name in s.picks)) throw new Error(`There is no number called "${String(c.name)}". They are: ${Object.keys(s.picks).join(', ')}.`)
      if (!Number.isFinite(c.value) || c.value < 0) throw new Error(`"${String(c.name)}" needs a number, 0 or more.`)
      return s.picks[c.name] === c.value ? s : frozen({ ...s, picks: { ...s.picks, [c.name]: c.value } })
    }
    default:
      throw new Error(`The land has no change called "${String((c as { what?: unknown }).what)}".`)
  }
}

/** The open land: its state, the one way to change it, and a way to be told of every change. */
export interface Land {
  readonly state: LandState
  /** Makes a change and returns the land after it. */
  change(c: Change): LandState
  /** Calls `told` after every change, with the land as it is now and as it was. Returns what stops it. */
  watch(told: (now: LandState, before: LandState) => void): () => void
}

/** WHAT THE USER LAID IN THE WORLD (23 Nov 2026, issue 127, piece 45): "Now in the world, place 4 stages from
 * x-20 to x20, and their height should be 8 meters, and then place another 2 from x-10 to x10", and, asked
 * where along y: "the first four should be on Y10 and the next two should be on Y20." Then: "these two rows have to be between
 * y10 and y30": read as the rows' edges, so the four cover y 10 to 20 (middles on y 15) and the two y 20 to 30
 * (middles on y 25). So four stages 10 m by
 * 10 m side by side, x -20 to 20, their middles on y 15, their base 8 m tall; and two side by side, x -10 to 10,
 * their middles on y 25. Then (piece 47): "They feel too crowded. ... we'll put 3 between y10 and y20 row with 1
 * base style gap between each, and then in the y20 to y30 row we will place the two stages in front of the empty
 * tiles." So three on y 15 at x -20, 0, 20 with a 10 m gap (one base tile) between each, centred on x 0 (MY
 * PICK), and two on y 25 at x -10 and 10, in front of the gaps. Then (piece 48): "The first row, let's make the height 4 meters." Then (piece 50): "Let's make the height of the first row to 6 meters." MY PICKS, not the user's word: the stage's own 10 m width and breadth (so four fill
 * x -20 to 20 exactly); the two at the stage's own base height, 2 m; each stands on the tiles' tops. */
const ON_TILES = BASE_TILE.size.z
export const LAID_BY_THE_USER: readonly Change[] = [
  ...[-20, 0, 20].map(x => ({ what: 'lay', element: STAGE.id, at: at(x, 15, ON_TILES), size: { z: 6 } }) as const),
  ...[-10, 10].map(x => ({ what: 'lay', element: STAGE.id, at: at(x, 25, ON_TILES) }) as const),
]

export function openLand(start: LandState = startOfLand()): Land {
  let state = start
  const watchers = new Set<(now: LandState, before: LandState) => void>()
  // A change made while the watchers are being told (the picture answering a change) waits its turn, so every
  // watcher sees every state once, in order.
  const waiting: Change[] = []
  let telling = false
  return {
    get state() { return state },
    change(c) {
      waiting.push(c)
      if (telling) return state
      telling = true
      try {
        while (waiting.length > 0) {
          const before = state
          state = changed(state, waiting.shift()!)
          if (state !== before) for (const told of [...watchers]) told(state, before)
        }
      } finally {
        telling = false
        waiting.length = 0
      }
      return state
    },
    watch(told) {
      watchers.add(told)
      return () => { watchers.delete(told) }
    },
  }
}

// WHAT FOLLOWS FROM THE STATE: the marks the four ways show. Worked out here, as data, so that the picture only
// draws them and a test can count them.

/** The whole `every` metres from one number to another (so from x -105 they start at x -100). */
export function marks(from: number, to: number, every = EVERY): number[] {
  const out: number[] = []
  for (let v = Math.ceil(from / every - 1e-9) * every; v <= to + 1e-9; v += every) out.push(v === 0 ? 0 : v)
  return out
}

/** The four edges of the land, each said by its two ends: the beginning's side first, and on round. */
export function edges(size: LandSize = SIZE): Span[] {
  const { x, y } = runs(size)
  const [a, b, c, d] = [at(x[0], y[0]), at(x[1], y[0]), at(x[1], y[1]), at(x[0], y[1])]
  return [{ from: a, to: b }, { from: b, to: c }, { from: c, to: d }, { from: d, to: a }]
}

/** The numbers along the four edges: what each says and where it stands, just outside the land. */
export function edgeNumbers(s: LandState): Array<{ words: string; place: Place }> {
  const { x, y } = runs(s)
  const out = s.picks.numbersOut
  return [
    ...marks(x[0], x[1]).flatMap(v => [
      { words: `x ${written(v)}`, place: at(v, y[0] - out) },
      { words: `x ${written(v)}`, place: at(v, y[1] + out) },
    ]),
    ...marks(y[0], y[1]).flatMap(v => [
      { words: `y ${written(v)}`, place: at(x[0] - out, v) },
      { words: `y ${written(v)}`, place: at(x[1] + out, v) },
    ]),
  ]
}

/** The name of one side of the land: the side it names (said by its two ends), the middle of that side, and
 * where the name stands. */
export interface SideName {
  readonly id: Side['id']
  readonly words: string
  readonly side: Span
  readonly middle: Place
  readonly place: Place
}

/** The names of the land's four sides: each stands on the ground just outside the land, off the middle of its
 * side. They follow the edge when it moves. */
export function sideNames(s: LandState): SideName[] {
  const [reach, out] = [runs(s), s.picks.namesOut]
  return SIDES.map(({ id, name, toward }) => {
    const middle = sideMiddle(id, s)
    return {
      id,
      words: name,
      // a side that lies toward low or high y runs along x, and the other way round
      side: toward.x === 0
        ? { from: at(reach.x[0], middle.y), to: at(reach.x[1], middle.y) }
        : { from: at(middle.x, reach.y[0]), to: at(middle.x, reach.y[1]) },
      middle,
      place: at(middle.x + toward.x * out, middle.y + toward.y * out),
    }
  })
}

/** An upright marker: the crossing it stands on, its size, its place in words, and where those words are. */
export interface Marker {
  readonly place: Place
  readonly size: Size
  readonly words: string
  readonly wordsAt: Place
}

/** The upright markers: one at every crossing of the stronger lines, standing by the middle of its base. */
export function markers(s: LandState): Marker[] {
  const size = { x: s.picks.markerWidth, y: s.picks.markerWidth, z: s.picks.markerHeight }
  const reach = runs(s)
  const [xs, ys] = [marks(reach.x[0], reach.x[1]), marks(reach.y[0], reach.y[1])]
  return xs.flatMap(x => ys.map(y => {
    const place = at(x, y)
    return { place, size, words: writePlace(place), wordsAt: at(x, y, s.picks.wordsAbove) }
  }))
}

/** Which markers show their words: those near the place the eye looks at. (Till 22 Nov: those near the eye
 * itself. An isometric eye stands far back and sees a thing as large far as near, so what is near in its
 * picture is what is round the place it looks at. MY PICK.) */
export function wordsShown(marker: Marker, s: LandState): boolean {
  return between(marker.wordsAt, s.eye.at) < s.picks.wordsWithin
}

/** How far it is from the middle of the land to the end's side (and to the beginning's), in metres. */
function wayReach(s: LandState): number {
  const end = sideOf('end').toward
  return Math.abs(end.x) * s.half + (Math.abs(end.y) * s.long) / 2
}

/** How far toward the end the place the eye looks at is from the middle of the land, in metres: less than 0
 * toward the beginning's side, more toward the end's. */
function wayAlong(s: LandState): number {
  const [m, end] = [middleOf(s), sideOf('end').toward]
  return (s.eye.at.x - m.x) * end.x + (s.eye.at.y - m.y) * end.y
}

/** How far the eye has travelled from the beginning toward the end, in metres: 0 at the beginning's side, the
 * land's whole length at the end's. */
export function travelled(s: LandState): number {
  return wayAlong(s) + wayReach(s)
}

/** Where a step on the ground is drawn in the picture of an eye that sees a thing as large far as near: how
 * far to the right and how far up, in metres. Worked out through the one crossing, in three.js's own order:
 * there the eye's right hand is the way it looks crossed with up, and what is up in its picture is its right
 * hand crossed with the way it looks. */
export function inPicture(eye: LandState['eye'], step: Place): { right: number; up: number } {
  const [from, to, s] = [toThree(eye.from), toThree(eye.at), toThree(step)]
  const far = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2])
  const look = [(to[0] - from[0]) / far, (to[1] - from[1]) / far, (to[2] - from[2]) / far] as const
  const flat = Math.hypot(look[0], look[2])
  const right = [(0 - look[2]) / flat, 0, look[0] / flat] as const
  const up = [right[1] * look[2] - right[2] * look[1], right[2] * look[0] - right[0] * look[2], right[0] * look[1] - right[1] * look[0]] as const
  return { right: s[0] * right[0] + s[1] * right[1] + s[2] * right[2], up: s[0] * up[0] + s[1] * up[1] + s[2] * up[2] }
}

/** How many metres the picture must hold from its bottom to its top, in a window this many times as wide as
 * it is tall, for the land to be seen from its left edge to its right edge with `viewMargin` metres beyond
 * each. THE USER, 22 Nov 2026: "we should also zoom out a bit because we are unable to see the edge of left
 * and right." MY PICK: that the picture fits itself to the window so, and the margin. */
export function pictureHolds(s: LandState, widthToHeight: number): number {
  const reach = s.half + s.picks.viewMargin
  const [toLeft, toRight] = [sideOf('left').toward, sideOf('right').toward]
  const steps = [inPicture(s.eye, at(toLeft.x * reach, toLeft.y * reach)), inPicture(s.eye, at(toRight.x * reach, toRight.y * reach))]
  const [across, upward] = [Math.max(...steps.map(p => Math.abs(p.right))), Math.max(...steps.map(p => Math.abs(p.up)))]
  return 2 * Math.max(upward, across / Math.max(widthToHeight, 0.1))
}

/** How long one metre of the way from the beginning to the end is drawn in the eye's picture, in metres: an
 * eye that looks down at a slant draws what lies on the ground shorter. */
export function wayInPicture(s: LandState): number {
  const end = sideOf('end').toward
  const drawn = inPicture(s.eye, at(end.x, end.y))
  return Math.hypot(drawn.right, drawn.up)
}

/** Whether the eye only slid from one sight to another: it looks the same way from as far. The picture lets
 * the eye glide through a slide, and puts it at once where a new way of looking begins. */
export function slid(before: LandState['eye'], now: LandState['eye']): boolean {
  const way = (e: LandState['eye']) => at(e.from.x - e.at.x, e.from.y - e.at.y, e.from.z - e.at.z)
  return between(way(before), way(now)) < 1e-6
}

/** The place under the pointer in words, or null when the pointer is not over the land. */
export function pointerWords(s: LandState): string | null {
  return s.pointer ? writePlace(s.pointer, s.picks.pointerDecimals) : null
}

/** Where a marker's box is, by the rule every thing follows: the middle of its base on its place. */
export function markerBox(marker: Marker) {
  return standsOn(marker.place, marker.size)
}

// THE THINGS LAID ON THE LAND.

/** A thing in words: what it is and where it lies. */
export function thingWords(t: Thing): string {
  return `${(elementOf(t)?.name ?? t.element).toLowerCase()} at ${writePlace(t.at)}`
}

/** One thing among the others: its element and its place, as text. */
const lies = (t: Thing) => `${t.element} at ${writePlace(t.at)}`

/** Whether the whole of a thing is on the land. */
function fits(t: Thing, size: LandSize): boolean {
  const e = elementOf(t)
  if (!e) return false
  const { x, y } = runs(size)
  return t.at.x - e.size.x / 2 >= x[0] - 1e-9 && t.at.x + e.size.x / 2 <= x[1] + 1e-9
    && t.at.y - e.size.y / 2 >= y[0] - 1e-9 && t.at.y + e.size.y / 2 <= y[1] + 1e-9
}

/** The whole land laid (the user: "Lay them on the land"): a base tile on every section the stronger lines
 * make, and an astroid wherever four tiles meet. */
export function covering(size: LandSize = SIZE): Thing[] {
  const step = BASE_TILE.size.x
  const reach = runs(size)
  const tiles: Thing[] = []
  for (let x = reach.x[0] + step / 2; x < reach.x[1]; x += step) {
    for (let y = reach.y[0] + step / 2; y < reach.y[1]; y += step) tiles.push({ element: BASE_TILE.id, at: at(x, y) })
  }
  return [...tiles, ...astroidsBetween(tiles)]
}

const ROUND = [[1, 1], [-1, 1], [-1, -1], [1, -1]] as const

/** An astroid for every place where four of these base tiles meet, two rows by two columns (the user: "when 4
 * of these tiles put together as 2 rows and 2 columns, the center forms a shape"). Where fewer meet, as along
 * the edge of the land, there is none. */
export function astroidsBetween(things: readonly Thing[]): Thing[] {
  const reach = BASE_TILE.size.x / 2
  const tiles = things.filter(t => t.element === BASE_TILE.id)
  const lying = new Set(tiles.map(t => writePlace(t.at)))
  const looked = new Set<string>()
  const astroids: Thing[] = []
  for (const tile of tiles) {
    for (const [sx, sy] of ROUND) {
      const corner = at(tile.at.x + sx * reach, tile.at.y + sy * reach, tile.at.z)
      if (looked.has(writePlace(corner))) continue
      looked.add(writePlace(corner))
      if (ROUND.every(([dx, dy]) => lying.has(writePlace(at(corner.x + dx * reach, corner.y + dy * reach, corner.z))))) {
        astroids.push({ element: ASTROID.id, at: corner })
      }
    }
  }
  return astroids
}

/** The things that lie over a spot of the ground. */
export function thingsOver(s: LandState, x: number, y: number): Thing[] {
  return s.things.filter(t => {
    const e = elementOf(t)
    return !!e && covers(e, x - t.at.x, y - t.at.y)
  })
}

/** How high the top of what is laid is over a spot of the ground, in metres: 0 where the ground is bare. */
export function topAt(s: LandState, x: number, y: number): number {
  return Math.max(0, ...thingsOver(s, x, y).map(t => t.at.z + (elementOf(t)?.size.z ?? 0)))
}

/** The top of the ground that is laid (the base tiles and the astroids between them), in metres: 0 on a bare
 * land. The land's lines lie on it; what stands on the ground (a stage) does not lift them (23 Nov 2026, piece 45:
 * with 8 m stages laid, the lines lay over everything at their top). */
export function groundTop(s: LandState): number {
  return s.things.reduce((top, t) => (t.element === BASE_TILE.id || t.element === ASTROID.id ? Math.max(top, t.at.z + (elementOf(t)?.size.z ?? 0)) : top), 0)
}

/** The highest top of all that is laid, in metres: 0 on a bare land. */
export function highestTop(s: LandState): number {
  return s.things.reduce((top, t) => Math.max(top, t.at.z + (elementOf(t)?.size.z ?? 0)), 0)
}
