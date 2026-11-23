// AN ELEMENT OF THE WORLD, HELD AS DATA (21 Nov 2026, issue 123 in noi-planning). An element is a thing the world
// can be built from. Each is written once, as data that code reads: its name, its size in metres, its shape and
// its surface. Its picture (make.ts) is made from this and from nothing else. Each element is in a folder of its
// own in this package (base-tile/, drone/ …); this file says what any element can be.
//
// Nothing here knows three.js, but for the code a thing drawn from files comes with (Model), which is handed in
// with its data and named here by its type only. Like every thing, an element stands on its place by the middle of its base: its
// outline is drawn round 0, 0, and it rises from z 0. Every colour is a role of Eidos by its token's name
// (eidos.ts). Since 23 Nov 2026 (issue 131) an element's own numbers are its own, named in its folder; only the
// tile, the stud, its registered size and its steps are Eidos's.
//
// What an element can be grew with the user's words, each written where it is used below: a slab, the astroid
// (21 Nov); a ring and a thing made of pieces, studs, states (22 Nov); frosted glass, a piece's border, borders
// that glow, colours and settings to try, a place to look out of, a thing laid from other elements, ground, and
// a strip that is bent or curled (23 Nov); a thing drawn from files, the characters (23 Nov: "bring in the
// characters into elements"). The solids of 21 Nov (glass, lit edges, cut edges, moons, parts that turn) were
// removed at the user's word on 22 Nov and are no longer here.
import type { CharacterDrawingMotion } from '@noi/eio-tokens/components'
import type { Bend } from './bend.ts'
import { role } from './eidos.ts'
import type { Drawn, DrawnHow } from './make.ts'
import type { Frame, Size, ThreeWorld, Xyz } from './space.ts'

/** A surface: its colour, as a role of Eidos by its token's name, and whether light shines back off it. */
export interface Surface {
  readonly colour: string
  /** Matte: no shine at all. Glossy: it shines and mirrors what is round it. Lit: it gives off its own colour,
   * whatever light falls on it (a small light on a thing). Frosted: glass that is not clear: what is behind it
   * shows through softened, and its thin edge catches the light. */
  readonly finish: 'matte' | 'glossy' | 'lit' | 'frosted'
  /** For frosted glass: how much a face hides of what is behind it, from 0 (nothing: left out) to 1 (all of it). */
  readonly hides?: number
  /** For a matte surface: how much it shines all the same, from 0 (not at all: left out) to 1 (glossy: smooth,
   * and mirroring what is round it). A piece's border shines as the piece does. */
  readonly shine?: number
  /** For frosted glass: how frosted it is, from 0 (clear: left out) to 1 (it scatters everything). */
  readonly frost?: number
  /** The surface in words. */
  readonly says: string
}

/** A border: the outermost `width` metres of an element, all the way round, in a colour of its own (a role of
 * Eidos by its token's name). It is part of the element's size, not added to it. */
export interface Border {
  readonly width: number
  readonly colour: string
  /** A piece's border only: the border's own surface, when it is not plain matte in its colour. So far only
   * frosted glass: a sheet of glass whose border is glass too, and shows as a border when a state lights it. */
  readonly surface?: Surface
}

/** A flat slab: a rectangle seen from above, its four corners rounded by `cornerRadius` metres, as thick as
 * the element's size says. It may have round `holes` right through it, each by its middle (metres from the
 * slab's middle) and its radius. */
export interface Slab {
  readonly kind: 'slab'
  readonly cornerRadius: number
  readonly holes?: ReadonlyArray<{ readonly x: number; readonly y: number; readonly radius: number }>
}

/** The shape four slabs leave open in their middle when they meet two by two: four points, each `radius`
 * metres from the middle along x or y, joined by four sides that curve inward, each a quarter of a circle of
 * that radius (the corner of one of the four slabs). */
export interface Astroid {
  readonly kind: 'astroid'
  readonly radius: number
}

/** A round ring seen from above: everything between `inner` and `outer` metres from its middle, as thick as
 * its size says. */
export interface Ring {
  readonly kind: 'ring'
  readonly outer: number
  readonly inner: number
}

/** A shape that is an outline seen from above, raised to a thickness. */
export type Flat = Slab | Astroid | Ring

/** One piece of a thing made of several: a flat shape of its own size, raised from its base by its thickness
 * (`size.z`). The middle of the piece's base is on its own place inside the element: `at` (metres along x and
 * y from the element's middle) and `up`. It is turned by `turn` degrees about the upright line through that
 * place (from x toward y).
 * `faces` says which way the piece is raised from its base. `up` (the usual): its outline lies flat and it
 * rises. `front`: its outline stands upright (its x along the element's x, its y going up) and it is raised
 * toward low y, which is an element's front; so a round shape that faces the front is a lens looking forward. */
export interface Piece {
  readonly name: string
  readonly shape: Flat
  readonly size: Size
  readonly at: { readonly x: number; readonly y: number }
  readonly turn?: number
  /** How far above the element's base the middle of the piece's own base is, in metres. Left out: on the
   * element's base. */
  readonly up?: number
  readonly faces?: 'up' | 'front'
  /** The piece's own surface, when it is not the element's. */
  readonly surface?: Surface
  /** The piece's own border, when it has one: the outermost part of it all the way round and through its whole
   * thickness, as a base tile's is. Only a slab can have one. */
  readonly border?: Border
  /** The part of the element this piece belongs to, by its name, when it is one of several pieces that move
   * together (a camera's head): a state can then say what that part does. */
  readonly part?: string
  /** When the piece spins, how. */
  readonly spin?: Spin
}

/** STUDS: A WAY TO PUT PIECES TOGETHER, AS THE TOY'S BRICKS DO (22 Nov 2026, issue 127). The user: "Now, drone is
 * a primitive. So, what I want you to imagine the drone as a Lego piece, and we will create more and more pieces
 * over time that can attach to the drone. So what we can do is we can create a Lego style attachment setup on
 * top of the body." A stud is a short round peg standing on top of an element. The studs of an element stand
 * on one square grid (studs.ts), `pitch` metres from one to the next, so that a later piece with sockets on the
 * same grid can be set on one stud or on several at once. They are data: a piece that attaches reads them. */
export interface Studs {
  /** From one stud's middle to the next along x or along y, in metres. */
  readonly pitch: number
  /** How far a stud's edge is from its middle, in metres. */
  readonly radius: number
  /** How tall a stud is, in metres. */
  readonly height: number
  /** Where each stud stands: the middle of its foot, in metres from the element's middle (x, y) and above the
   * element's base (z). */
  readonly at: readonly Xyz[]
}

/** A piece that spins about the upright line through its own place: one whole turn every `turnEvery` seconds;
 * `way` 1 turns it from x toward y, -1 the other way. */
export interface Spin {
  readonly turnEvery: number
  readonly way: 1 | -1
}

/** How far a piece is turned after so many seconds, in degrees from x toward y: its own turn, and what its
 * spin has added. */
export function pieceTurn(piece: Piece, seconds: number): number {
  return (piece.turn ?? 0) + (piece.spin ? (piece.spin.way * 360 * seconds) / piece.spin.turnEvery : 0)
}

/** A thing made of several pieces, all in the element's one surface. */
export interface Pieces {
  readonly kind: 'pieces'
  readonly pieces: readonly Piece[]
  /** The shape in words. */
  readonly says: string
}

/** A thing laid from other elements: each of them standing on the thing's base, on its own place (metres from
 * the thing's middle along x and y), as the land is laid from base tiles and astroids. It is drawn as those
 * elements are, however many there are. */
export interface Laid {
  readonly kind: 'laid'
  readonly things: ReadonlyArray<{ readonly element: WorldElement; readonly at: { readonly x: number; readonly y: number }; readonly under?: true }>
  /** The shape in words. */
  readonly says: string
  /** When the thing is laid on a strip (bend.ts): then each thing's place is the strip's x across and y along, and
   * a thing `under` is laid turned over, on the face below. */
  readonly bend?: Bend
  /** When the thing is laid on a strip of another shape (wave.ts): where the strip's place x, y is, and its ways. */
  readonly frame?: (x: number, y: number) => Frame
}

/** A THING DRAWN FROM FILES (23 Nov 2026): a model made elsewhere, with its bones and its clips, which is loaded when
 * the thing is first shown, not when a page opens (the characters: Clay, the Mannequin, the Fairy Bot). Its data
 * cannot say its shape piece by piece, so the code that draws it comes with it (`drawn`: a character's is the
 * character drawing). Seen from above it takes up the ground its size says: so wide along x and so deep along y,
 * round its middle. Like every thing it stands on its place by the middle of its base, and faces low y, an
 * element's front. */
export interface Model {
  readonly kind: 'model'
  /** Draws it into the world: at once, and empty till its files have come. */
  readonly drawn: (world: ThreeWorld, how: DrawnHow) => Drawn
  /** The shape in words. */
  readonly says: string
}

export interface WorldElement {
  /** What code calls it. */
  readonly id: string
  /** What it is called in words. */
  readonly name: string
  /** How a sentence calls it, when that is not "the" and its name in small letters: a character is called by its
   * own name (Clay). */
  readonly called?: string
  /** One plain sentence on what it is. */
  readonly says: string
  /** How far it runs along x, along y, and up, in metres. */
  readonly size: Size
  readonly shape: Flat | Pieces | Laid | Model
  readonly surface: Surface
  /** Its border, when it has one. */
  readonly border?: Border
  /** Where another piece can be set on it, when it has such places. */
  readonly studs?: Studs
  /** Where it takes the studs of what it is set on: the places underneath it, on the same grid (z 0: its base). */
  readonly sockets?: Studs
  /** The states it can be in, when it has any. It is in exactly one at a time, and starts in the first. */
  readonly states?: readonly ElementState[]
  /** Where one can look out of it, when one can: a camera's view. */
  readonly lookOut?: LookOut
  /** Colours of its own that one may try out, when it has any (ElementColour). */
  readonly colours?: readonly ElementColour[]
  /** Settings of its own that one may try out, when it has any (ElementSetting). */
  readonly settings?: readonly ElementSetting[]
  /** When it is ground, on which a thing that stands by itself can be placed: where the middle of that thing's
   * base then is, in metres from this element's middle (x, y) and above its base (z). `step`: the ground is in
   * sections so many metres across, and that place is the middle of one; a thing an even number of sections
   * wide (two or more) stands half a section on, so that it covers whole sections. */
  readonly ground?: { readonly x: number; readonly y: number; readonly z: number; readonly step?: number }
  /** The same element in another size, when its size can be chosen (a setting `size`): so wide along x, so long
   * along y, and so tall. Which of its parts is that tall is the element's own to say (of the stage: its base). */
  readonly sized?: (to: Size) => WorldElement
  /** The same element at another step of its scale, when it has one (a setting `scale`): so many times its Base
   * size. What grows with it, and what stays one size (the drone's studs), is the element's own to say. */
  readonly scaled?: (factor: number) => WorldElement
}

/** A COLOUR OF AN ELEMENT THAT ONE MAY TRY OUT (23 Nov 2026, issue 127). The user, of the stage: "I actually love
 * the active state of the stage, but I want to play with colors on the sides, border, top face, the glass slab.
 * So in the element of [stage], can you add these controls so that I can just play around and see what works and
 * what doesn't work?" So an element may name colours of its own. Each has a name in words and the colour it has
 * to begin with (a role of Eidos by its token's name). A state's glow says which of them each lit part gives
 * off; a made thing can be given another colour for one of them; and the page offers each as a choice among
 * Eidos's colours (COLOURS_TO_TRY). What is tried is not kept: the data here is what the element is. */
export interface ElementColour {
  /** What code and a state's glow call it. */
  readonly id: string
  /** What it is called in words. */
  readonly name: string
  readonly colour: string
}

/** The colours one may try on a thing of the world: roles of Eidos by their tokens' names, each with a plain
 * name. MY PICK, not the user's word: which roles are offered, and what each is called. Eidos has no part for
 * choosing any colour at all, so the choice is among its own. */
export const COLOURS_TO_TRY: ReadonlyArray<{ readonly colour: string; readonly name: string }> = [
  { colour: role('noi.eio.color.action.primary'), name: 'Lime (primary)' },
  { colour: role('noi.eio.color.action.secondary'), name: 'Purple (secondary)' },
  { colour: role('noi.eio.color.world.wall'), name: 'White' },
  { colour: role('noi.eio.color.world.step-edge'), name: 'Grey' },
  { colour: role('noi.eio.color.border.default'), name: 'Dark grey' },
  { colour: role('noi.eio.color.world.land'), name: 'Black' },
  { colour: role('noi.eio.color.world.water'), name: 'Blue' },
  { colour: role('noi.eio.color.text.success'), name: 'Green' },
  { colour: role('noi.eio.color.text.warning'), name: 'Amber' },
  { colour: role('noi.eio.color.text.danger'), name: 'Red' },
]

/** The colours of an element that one of its states lights with: those its glow names, in the element's own
 * order. None when the state lights nothing. */
export function coloursIn(e: WorldElement, state: ElementState | null | undefined): ElementColour[] {
  const glow = state?.glow
  if (!glow || !e.colours) return []
  const named = new Set([...glow.borders.map(b => b.colour), ...(glow.tops ?? []).map(t => t.colour)])
  return e.colours.filter(c => named.has(c.id))
}

/** A SETTING OF AN ELEMENT THAT ONE MAY CHOOSE (23 Nov 2026, issue 127). First there were ten settings of the
 * stage's material, light and glass to try ("what controls can we have on the material, the light, and the
 * glass"; "Yes, add them"). Having tried them, the user fixed them: "these are the settings I want you to fix for
 * the stage. Only controls we need are colour, width, breadth and height. The height is only for base. Sizes are
 * steps of 10m." So what a setting sets now is a size: how far the element runs along x (its width), along y
 * (its breadth), or how tall it is (z). Each is in a group, has a name in words, offers steps to choose among,
 * and has the value the element is made with. Choosing one makes the element again in that size (`sized`).
 * A setting may instead set a step of the element's scale (23 Nov 2026, the drone): its steps are shares of the
 * element's Base size, and choosing one makes the element again at that step (`scaled`). */
export interface ElementSetting {
  /** What code calls it. */
  readonly id: string
  /** The group it is offered in, in words. */
  readonly group: string
  /** What it is called in words. */
  readonly name: string
  readonly sets: { readonly what: 'size'; readonly along: 'x' | 'y' | 'z' } | { readonly what: 'scale' }
  /** What one may choose: each a name in words and the number it stands for. */
  readonly steps: ReadonlyArray<{ readonly name: string; readonly value: number }>
  /** The number the element is made with: one of the steps. */
  readonly value: number
}

/** What a choice of sizes is: a size along x, y or z, or a step of a scale (`scale`, so many times the Base size). */
export type Chosen = Partial<Size> & { readonly scale?: number }

/** What a setting is chosen under: the way it sizes the element along (x, y or z), or `scale`. */
export function chosenAs(setting: ElementSetting): keyof Chosen {
  return setting.sets.what === 'scale' ? 'scale' : setting.sets.along
}

/** The element made in the sizes chosen: `chosen` by x, y and z, or by a step of its scale, and for the rest the
 * numbers its own settings say it is made with. Null when its size cannot be chosen. A SCALE (23 Nov 2026, issue
 * 131): the user decided that the drone is sized by a scale, "small, default, medium, large can be 0.5, 1, 1.5, and
 * 2", while the stage is sized along each way in steps; so an element may be made at a step of its scale. */
export function sizedBy(e: WorldElement, chosen: Chosen): WorldElement | null {
  const made = (as: keyof Chosen) => e.settings?.find(s => chosenAs(s) === as)?.value
  if (e.scaled) return e.scaled(chosen.scale ?? made('scale') ?? 1)
  if (!e.sized) return null
  const own = (along: 'x' | 'y' | 'z') => chosen[along] ?? made(along) ?? e.size[along]
  return e.sized({ x: own('x'), y: own('y'), z: own('z') })
}

/** A PLACE TO LOOK OUT OF AN ELEMENT (23 Nov 2026, issue 127). The user: "Also add Camera view, I mean, through
 * the camera." So an element may say where an eye is in it: `at`, metres from the element's middle (x, y) and
 * above its base (z). The eye looks toward the element's front (low y), goes with the element as it acts out
 * its state, and turns with the part named `part` when there is one (a camera's head). `sees` is how wide it
 * sees, in degrees from the bottom of its picture to the top. */
export interface LookOut {
  readonly at: Xyz
  readonly part?: string
  readonly sees: number
}

/** A STATE OF AN ELEMENT (22 Nov 2026, issue 127). The user: "I also think each [element] also have their own set
 * of controls that are specific to them. For example, the camera is used to view, so a drone is used to fly
 * around and hover on the different states of it. So I think we should also cater for those states and features
 * of an element." So an element may have states. Each has a name, says in a sentence what the element does in
 * it, and holds as data what that is; a thing made from the element acts it out (make.ts), and the page offers
 * an element's states as that element's own control. What is left out of a state is at rest. Each element's
 * states are keys Mero holds for it (its component's group `state`).
 * MY DESIGN, not the user's word: what a state can say (the six things below), and that the hand chooses one
 * state at a time. */
export interface ElementState {
  /** What code calls it. */
  readonly id: string
  /** What it is called in words: the thing "is" this. */
  readonly name: string
  /** One plain sentence on what the element does in it. */
  readonly says: string
  /** How far above its place the whole element is, in metres. */
  readonly lift?: number
  /** It rises and sinks `by` metres either way, once every `every` seconds. */
  readonly bob?: { readonly by: number; readonly every: number }
  /** It goes round its place on a circle `radius` metres out, once every `every` seconds, its front first,
   * leaning `lean` degrees forward. */
  readonly round?: { readonly radius: number; readonly every: number; readonly lean: number }
  /** How fast its spinning pieces turn, as a share of their own speed: 0 is still. Left out: their own speed. */
  readonly spin?: number
  /** Its part of this name turns to and fro about the upright line through the element's middle: `by` degrees
   * either way, once every `every` seconds. */
  readonly sweep?: { readonly part: string; readonly by: number; readonly every: number }
  /** Borders of its pieces give off light, whatever light falls on them: each by its piece's name; with
   * `faces: 'up'` only where the border looks up (the border of a block's top face), else all of the border (so
   * the walls of a block too: its border runs through its whole height). `tops`: the whole top face of each of
   * these pieces gives off light too, by the piece's name.
   * IN WHICH COLOUR: `colour` (a role of Eidos by its token's name), unless a part names one of the element's own
   * colours (ElementColour, by its id).
   * HOW BRIGHTLY, from 0 to 1 (left out: 1, the colour itself): a border's `bright` is for where it looks up
   * or down, its `sidesBright` for where it looks sideways (a block's walls; left out: as `bright`), a top's
   * `bright` for that top face.
   * `whole` (23 Nov 2026, for the astroid; the user: "the asteroids between the tiles should glow ... it should be
   * a state, right?"): a thing that is ONE PLAIN SHAPE, without pieces or a border, gives off light all over, so
   * many times its colour (`bright`: 1 is the colour itself, more is brighter than it). And `round` it, on what it
   * stands on, lies a soft light of that colour: `across` metres across, `above` metres over the thing's top,
   * and so strong at its middle (`bright`, 0 to 1), fading to nothing at its edge; it adds to what is under it. */
  readonly glow?: {
    readonly colour: string
    readonly borders: ReadonlyArray<{ readonly piece: string; readonly faces?: 'up'; readonly colour?: string; readonly bright?: number; readonly sidesBright?: number }>
    readonly tops?: ReadonlyArray<{ readonly piece: string; readonly colour?: string; readonly bright?: number }>
    readonly whole?: { readonly bright: number; readonly round?: { readonly across: number; readonly above: number; readonly bright: number } }
  }
  /** What a character does in it, by the motion Mero holds for the character drawing: stands plainly, or plays its
   * walk or its run on its place. Left out: it stands. */
  readonly motion?: CharacterDrawingMotion
}

/** Where an element is and what it is doing, some seconds into a state: where the middle of its base is from
 * its place (x, y, z, in metres), which way it is turned and how far it leans forward (degrees), how fast its
 * spinning pieces turn (a share of their own speed), and which part is turned how far (degrees), if one is. */
export interface Pose {
  readonly x: number
  readonly y: number
  readonly z: number
  readonly heading: number
  readonly lean: number
  readonly spin: number
  readonly sweep: { readonly part: string; readonly turn: number } | null
}

/** What an element does `seconds` into a state. With no state it is at rest on its place, its spinning pieces
 * turning at their own speed. */
export function poseIn(state: ElementState | undefined, seconds: number): Pose {
  const turns = (every: number) => (2 * Math.PI * seconds) / every
  const lift = (state?.lift ?? 0) + (state?.bob ? state.bob.by * Math.sin(turns(state.bob.every)) : 0)
  const sweep = state?.sweep ? { part: state.sweep.part, turn: state.sweep.by * Math.sin(turns(state.sweep.every)) } : null
  const spin = state?.spin ?? 1
  const round = state?.round
  if (!round) return { x: 0, y: 0, z: lift, heading: 0, lean: 0, spin, sweep }
  // round its place, from x toward y, starting on the side of low x: there its front (low y) is its way, so it
  // starts turned as it stands
  const a = Math.PI + turns(round.every)
  return { x: round.radius * Math.cos(a), y: round.radius * Math.sin(a), z: lift, heading: ((turns(round.every) * 180) / Math.PI) % 360, lean: round.lean, spin, sweep }
}

/** How far an element reaches while it is in a state, as a size: along x, along y, and up. Whoever looks at it
 * must stand back that far. */
export function reachIn(e: WorldElement, state: ElementState | undefined): Size {
  const out = 2 * (state?.round?.radius ?? 0)
  return { x: e.size.x + out, y: e.size.y + out, z: e.size.z + (state?.lift ?? 0) + (state?.bob?.by ?? 0) }
}

/** Whether a thing stands by itself on a ground: it is not that ground, nor ground itself, nor a piece that goes
 * on studs (it has sockets), nor one of the elements that ground is laid from. */
function standsAlone(piece: WorldElement, ground: WorldElement): boolean {
  // a whole platform is not set on another (the Möbius strip, 23 Nov 2026, is a base as the base platform is)
  if (piece === ground || piece.ground || piece.sockets || piece.shape.kind === 'laid') return false
  return !(ground.shape.kind === 'laid' && ground.shape.things.some(t => t.element === piece))
}

/** Where a piece with sockets goes on a thing with studs: the place for the middle of the piece's base, in the
 * thing's own x, y and z. The two must be on one grid (the same pitch and the same size of stud), and the piece's
 * sockets as deep as the studs are tall. ONE SIZE OF STUD (23 Nov 2026, issue 131): a larger element carries more
 * studs, not larger ones, so as with the toy's bricks a piece goes on wherever its sockets take studs: every stud
 * under its base goes into a socket, and at least one does. Of those places it takes the one that holds the most
 * studs, and of those the one nearest the middle; so the camera module (four sockets) stands on the middle of a
 * drone with sixteen studs, and on the one stud of the smallest drone.
 * And where a thing goes on ground: the place the ground's data says, for a thing that stands by itself. Null when
 * there is no such place. */
export function fitsOn(piece: WorldElement, onto: WorldElement): Xyz | null {
  if (onto.ground) {
    if (!standsAlone(piece, onto)) return null
    const { x, y, z, step } = onto.ground
    // a thing an even number of sections wide stands half a section on, so that it covers whole sections
    const on = (across: number) => {
      const sections = step ? Math.round(across / step) : 1
      return step && sections >= 2 && sections % 2 === 0 ? step / 2 : 0
    }
    return { x: x + on(piece.size.x), y: y + on(piece.size.y), z }
  }
  const [sockets, studs] = [piece.sockets, onto.studs]
  if (!sockets || !studs || sockets.at.length === 0) return null
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
  if (!same(sockets.pitch, studs.pitch) || !same(sockets.radius, studs.radius) || sockets.height < studs.height - 1e-9) return null
  // the square the sockets take under the piece, half a pitch round the outer sockets
  const [xs, ys] = [sockets.at.map(s => s.x), sockets.at.map(s => s.y)]
  const half = sockets.pitch / 2
  const under = { x: [Math.min(...xs) - half, Math.max(...xs) + half], y: [Math.min(...ys) - half, Math.max(...ys) + half] } as const
  let best: { move: Xyz; held: number; off: number } | null = null
  for (const stud of studs.at) {
    for (const socket of sockets.at) {
      const move = { x: stud.x - socket.x, y: stud.y - socket.y, z: stud.z - socket.z }
      // the studs under the piece's base, at this place; each must go into a socket
      const covered = studs.at.filter(t => same(t.z, move.z) && t.x - move.x > under.x[0] && t.x - move.x < under.x[1] && t.y - move.y > under.y[0] && t.y - move.y < under.y[1])
      if (!covered.every(t => sockets.at.some(s => same(s.x + move.x, t.x) && same(s.y + move.y, t.y)))) continue
      const off = Math.hypot(move.x, move.y)
      if (!best || covered.length > best.held || (covered.length === best.held && off < best.off - 1e-9)) best = { move, held: covered.length, off }
    }
  }
  return best ? { x: best.move.x === 0 ? 0 : best.move.x, y: best.move.y === 0 ? 0 : best.move.y, z: best.move.z } : null
}

/** A length in words: to the millimetre at the finest, with no long tail. */
export const metres = (n: number) => String(Math.round(n * 1000) / 1000)

/** An element's size in words: a strip that is bent is so tall, and so is a character; a flat thing so thick. */
export function sizeWords(e: WorldElement): string {
  const tall = (e.shape.kind === 'laid' && e.shape.bend) || e.shape.kind === 'model'
  return `${metres(e.size.x)} m along x, ${metres(e.size.y)} m along y, ${metres(e.size.z)} m ${tall ? 'tall' : 'thick'}`
}

/** How a sentence calls an element: its own name for a character (Clay), else "the" and its name in small letters;
 * `first`, at the start of a sentence ("The drone"). */
export function calledIn(e: WorldElement, first = false): string {
  const called = e.called ?? `the ${e.name.toLowerCase()}`
  return first ? called.charAt(0).toUpperCase() + called.slice(1) : called
}

/** A kind of shape that one of the choices below has no answer for: the type check stops here until every
 * choice (words, ground covered, outline) names every kind. */
export function noSuchShape(shape: never): never {
  throw new Error(`A kind of shape nothing here can draw: ${JSON.stringify(shape)}`)
}

/** An element's shape in words. */
export function shapeWords(e: WorldElement): string {
  switch (e.shape.kind) {
    case 'slab': return `corners rounded by ${e.shape.cornerRadius} m`
    case 'astroid': return `four points ${e.shape.radius} m from its middle, sides curved inward by ${e.shape.radius} m`
    case 'ring': return `a round ring ${metres(e.shape.outer)} m out from its middle, its band ${metres(e.shape.outer - e.shape.inner)} m wide`
    case 'pieces': return e.shape.says
    case 'laid': return e.shape.says
    case 'model': return e.shape.says
    default: return noSuchShape(e.shape)
  }
}

/** An element's surface in words. */
export function surfaceWords(e: WorldElement): string {
  return e.surface.says
}

/** An element's border in words, or null when it has none. */
export function borderWords(e: WorldElement): string | null {
  return e.border ? `a border ${e.border.width} m wide` : null
}

/** All of an element in words: its size, its shape, its surface, and its border when it has one. */
export function inWords(e: WorldElement): string {
  return [sizeWords(e), shapeWords(e), surfaceWords(e), borderWords(e)].filter(part => part !== null).join('; ')
}

/** Which way the eye first stands from an element (firstSight). (Till 22 Nov 2026: x 0.42. The user had x turned
 * round, place.ts in the Explorer; the eye stays where it was.) */
const TOWARD = { x: -0.42, y: -0.72, z: 0.55 } as const
/** How the eye first frames an element: it sees at most this many degrees from the bottom of its picture to the
 * top, and stands this many times as far back as the element's farthest corner needs. */
const FIRST_SIGHT = { widestAngle: 50, margin: 1.15 } as const

/** Where the eye stands to see the whole of an element, and what it looks at: a pick of mine, so that the
 * gallery's picture and the first sight in the 3D view are the same for every element. It stands toward low y
 * and a little toward low x, above, far enough for the element's farthest corner to be in sight, with a margin.
 * Which way it stands from the element (`TOWARD`), how wide the eye sees at the widest (`FIRST_SIGHT`) and the
 * margin round the element are this file's own (the drawing's tuning, not registered). Where it stands is said to
 * the tenth of a metre. */
export function firstSight(e: WorldElement, widestAngle: number = FIRST_SIGHT.widestAngle): { from: Xyz; at: Xyz } {
  const at = { x: 0, y: 0, z: e.size.z / 2 }
  const reach = Math.hypot(e.size.x, e.size.y, e.size.z) / 2
  const far = (reach / Math.sin((widestAngle / 2) * (Math.PI / 180))) * FIRST_SIGHT.margin
  const long = Math.hypot(TOWARD.x, TOWARD.y, TOWARD.z)
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    from: { x: round(at.x + (TOWARD.x / long) * far), y: round(at.y + (TOWARD.y / long) * far), z: round(at.z + (TOWARD.z / long) * far) },
    at,
  }
}
