// THE WORLD'S ELEMENTS, HELD AS DATA (21 Nov 2026, issue 123 in noi-planning). An element is a thing the world
// can be built from. Each is written here once, as data that code reads: its name, its size in metres, its
// shape and its surface. The picture of an element (makeElement.ts) is made from this and from nothing else,
// and the gallery (gallery/) shows every element in this list.
//
// THE USER'S WORDS for the first one: "the base tile element, where the tile, one tile is for 10 meters into
// 10 meters section, but with 1 meter border radius. The tile has to be matte black."
// MY PICK, not the user's word: how thick the tile is (0.2 m). They gave no thickness.
//
// THE USER'S WORDS for the second: "when 4 of these tiles put together as 2 rows and 2 columns, the center forms
// a shape called [astroid]. So I want the [astroid] element, and it should be the secondary color". So the
// astroid is worked out FROM the base tile, never written beside it: its four curved sides are the four tiles'
// rounded corners, and it is as thick as they are. Its colour is Eidos's secondary colour.
// MY PICK, not the user's word: that it is matte like the tile.
//
// THE USER'S WORDS for the tile's border: "what I want to add to tiles is that ... to have a border. Let's keep
// the border size to be 0.1 meters." So the outermost 0.1 m of a tile, all the way round and through its whole
// thickness, is its border; the tile stays 10 m by 10 m.
// MY PICKS, not the user's word: the border's colour (Eidos's own border colour, as on Eidos's cards; they gave
// its size only), and that it is matte like the rest.
//
// Nothing here knows three.js. Like every thing, an element stands on its place by the middle of its base: its
// outline is drawn round 0, 0, and it rises from z 0.
//
// SOLIDS, AND A SECOND LOOK (21 Nov 2026). The user: "Now I want to build the following elements. 1. 8 equally
// sided diamond 2. Lowpoly Sphere 3. Cube 4. Octahedron 5. Triangular Prism. All these shapes should be
// transparent glossy and edge illuminating with primary lime light. The edges have to be primary." So a shape
// may also be a solid (corners and flat faces: solids.ts), a surface may also be glass (see-through and
// glossy), and an element may have lit edges. Each solid is one file in elements/, so several can be made at
// once without two hands in one file; the look they share is written once, in elements/look.ts.
//
// THE SOLIDS UPGRADED (21 Nov 2026). The user, with a picture of a faceted ball ringed by smaller ones: "This
// [sphere] should be surrounded by smaller, different sized spheres rotating around the main sphere as a
// planet ... In the image, the sphere also has a little extrusion at the edge, and I like that. Let's try that
// edge [design] for other primitives that we are creating. Let's remove the triangular prism shape and cube."
// So: the cube and the triangular prism are gone; a solid may have a cut edge and an orbit of moons.
//
// THE FOUR SOLIDS REMOVED (22 Nov 2026, issue 127). The user: "I want you to remove the diamond, [low-poly]
// sphere, octahedron, hexagon [tori] shapes from the world elements that we have built in the gallery." So the
// elements are the base tile and the astroid. What a solid is and how one is drawn (solids.ts, the glossy
// look in elements/look.ts, cut edges, moons, parts that turn) stays in the code, used by no element, for the
// next solid. A copy of the four is kept outside this repository, with the planning notes.
//
// A RING, AND A THING MADE OF PIECES (22 Nov 2026, issue 127). The user, of the drone, with a picture of one seen
// from above: "Let's use the following image as reference and use our [astroid] primitive". The picture shows
// the astroid with a round ring in each of its four curved sides and short joins between. So a shape may also
// be a round ring, and an element may be made of several pieces, each a flat shape on its own place inside the
// element. The drone is the first such element; it is written below, beside the astroid it is made from.
//
// FROSTED GLASS, A PIECE'S BORDER, AND BORDERS THAT GLOW (23 Nov 2026, issue 127). The user, with a picture: "The
// next element I want you to build is the stage." The picture is a low block under a floating sheet of frosted
// glass. So a surface may also be frosted glass; a piece may have a border, as a base tile has; and a state may
// have borders give off light. The stage is written below. (It was first a block of lime light, in a surface
// kind `light`; the user chose the base tile's style, and that kind is gone. A copy is kept outside this
// repository, with the planning notes.)
//
// A THING LAID FROM OTHER ELEMENTS, AND GROUND (23 Nov 2026, issue 127). The user: "Let's add the base platform as
// element in the gallery too. So that I can select items to place on the platform just like we do in the drone."
// So a shape may also be laid from other elements, each on its own place, as the land is laid from base tiles
// and astroids; and an element may be ground: a thing that stands by itself can be placed on it. The base
// platform is written below, after the tile and the astroid it is laid from.
import { bentSize, bentWalk, lengthOf, type Bend } from './bend.ts'
import type { Size } from './place.ts'
import { wavePlatform } from './wavePlatform.ts'
import { footprint, inside, type Corner, type Face, type Moon } from './solids.ts'

/** A surface: its colour, as a role of Eidos by its token's name, and whether light shines back off it. */
export interface Surface {
  readonly colour: string
  /** Matte: no shine at all. Glossy: it shines and mirrors what is round it. Glass: see-through and glossy
   * (tried on the solids and not liked by the user; no element has it). Lit: it gives off its own colour,
   * whatever light falls on it (a small light on a thing). Frosted: glass that is not clear: what is behind it
   * shows through softened, and its thin edge catches the light. */
  readonly finish: 'matte' | 'glossy' | 'glass' | 'lit' | 'frosted'
  /** For glass and frosted glass: how much a face hides of what is behind it, from 0 (nothing) to 1 (all of it). */
  readonly hides?: number
  /** For a matte surface: how much it shines all the same, from 0 (not at all: left out) to 1 (glossy: smooth,
   * and mirroring what is round it). A piece's border shines as the piece does. */
  readonly shine?: number
  /** For frosted glass: how frosted it is, from 0 (clear) to 1 (it scatters everything). Left out: the usual. */
  readonly frost?: number
  /** The surface in words. */
  readonly says: string
}

/** Lit edges: every edge of a solid drawn as a thin rod that gives off its own light, in a colour of Eidos (by
 * its token's name). `width` is how thick the rod is, in metres. */
export interface LitEdges {
  readonly colour: string
  readonly width: number
  /** The edges in words. */
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
 * on one square grid, `pitch` metres from one to the next, so that a later piece with sockets on the same grid
 * can be set on one stud or on several at once. They are data: a piece that attaches reads them. */
export interface Studs {
  /** From one stud's middle to the next along x or along y, in metres. */
  readonly pitch: number
  /** How far a stud's edge is from its middle, in metres. */
  readonly radius: number
  /** How tall a stud is, in metres. */
  readonly height: number
  /** Where each stud stands: the middle of its foot, in metres from the element's middle (x, y) and above the
   * element's base (z). */
  readonly at: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number }>
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

/** A cut edge: every edge and corner of a solid cut flat into a narrow strip, `width` metres in from the edge
 * on each face, so that light catches it (solids.ts, `bevelled`). */
export interface CutEdge {
  readonly width: number
  /** The cut edge in words. */
  readonly says: string
}

/** Smaller balls that go round an element, as moons round a planet: each moon (solids.ts), how far their round
 * leans from level in degrees, and how many seconds one whole turn takes. They go round the element's middle. */
export interface Orbit {
  readonly moons: readonly Moon[]
  readonly lean: number
  readonly turnEvery: number
  /** The moons in words. */
  readonly says: string
}

/** Parts that turn, as the rings of a lock that is opened by a code. Each separate part of a solid, counted from
 * the lowest up, turns about the upright line through the element's middle: the next part the opposite way to
 * the one below it, all at the same moments and as far. They turn in clicks of `click` degrees; `code` says how
 * many clicks each move is (the moves come one after another, then again from the first); a click takes
 * `clickFor` seconds, and between two moves they rest `restFor` seconds (solids.ts, `turned`). */
export interface Turning {
  readonly click: number
  readonly code: readonly number[]
  readonly clickFor: number
  readonly restFor: number
  /** The turning in words. */
  readonly says: string
}

/** A solid: a shape with flat faces all round, given by its corners (metres; z up) and its faces (each the
 * numbers of its corners in order round it). It stands by the middle of its base: its lowest corner is at z 0
 * and it is centred on x 0, y 0 (solids.ts, `standing`, does that). */
export interface Solid {
  readonly kind: 'solid'
  readonly points: readonly Corner[]
  readonly faces: readonly Face[]
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
  readonly frame?: (x: number, y: number) => import('./wave.ts').Frame
}

export interface WorldElement {
  /** What code calls it. */
  readonly id: string
  /** What it is called in words. */
  readonly name: string
  /** One plain sentence on what it is. */
  readonly says: string
  /** How far it runs along x, along y, and up, in metres. */
  readonly size: Size
  readonly shape: Flat | Solid | Pieces | Laid
  readonly surface: Surface
  /** Its border, when it has one. */
  readonly border?: Border
  /** Its lit edges, when it has them. Solids only. */
  readonly edges?: LitEdges
  /** Its cut edge, when it has one. Solids only. */
  readonly cutEdge?: CutEdge
  /** The smaller balls going round it, when it has them. Solids only. */
  readonly orbit?: Orbit
  /** How its separate parts turn, when they do. Solids only. */
  readonly turning?: Turning
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
}

/** A COLOUR OF AN ELEMENT THAT ONE MAY TRY OUT (23 Nov 2026, issue 127). The user, of the stage: "I actually love
 * the active state of the stage, but I want to play with colors on the sides, border, top face, the glass slab.
 * So in the element of [stage], can you add these controls so that I can just play around and see what works and
 * what doesn't work?" So an element may name colours of its own. Each has a name in words and the colour it has
 * to begin with (a role of Eidos by its token's name). A state's glow says which of them each lit part gives
 * off; a made thing can be given another colour for one of them; and the gallery offers each as a choice among
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
  { colour: '--eio-color-action-primary', name: 'Lime (primary)' },
  { colour: '--eio-color-action-secondary', name: 'Purple (secondary)' },
  { colour: '--eio-color-world-wall', name: 'White' },
  { colour: '--eio-color-world-step-edge', name: 'Grey' },
  { colour: '--eio-color-border-default', name: 'Dark grey' },
  { colour: '--eio-color-world-land', name: 'Black' },
  { colour: '--eio-color-world-water', name: 'Blue' },
  { colour: '--eio-color-text-success', name: 'Green' },
  { colour: '--eio-color-text-warning', name: 'Amber' },
  { colour: '--eio-color-text-danger', name: 'Red' },
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
 * and has the value the element is made with. Choosing one makes the element again in that size (`sized`). */
export interface ElementSetting {
  /** What code calls it. */
  readonly id: string
  /** The group it is offered in, in words. */
  readonly group: string
  /** What it is called in words. */
  readonly name: string
  readonly sets: { readonly what: 'size'; readonly along: 'x' | 'y' | 'z' }
  /** What one may choose: each a name in words and the number it stands for. */
  readonly steps: ReadonlyArray<{ readonly name: string; readonly value: number }>
  /** The number the element is made with: one of the steps. */
  readonly value: number
}

/** The size an element is made in when some of its sizes are chosen: `chosen` by x, y and z, and for the rest
 * the numbers its own settings say it is made with. Null when its size cannot be chosen. */
export function sizedBy(e: WorldElement, chosen: Partial<Size>): WorldElement | null {
  if (!e.sized) return null
  const own = (along: 'x' | 'y' | 'z') => chosen[along] ?? e.settings?.find(s => s.sets.along === along)?.value ?? e.size[along]
  return e.sized({ x: own('x'), y: own('y'), z: own('z') })
}

/** A PLACE TO LOOK OUT OF AN ELEMENT (23 Nov 2026, issue 127). The user: "Also add Camera view, I mean, through
 * the camera." So an element may say where an eye is in it: `at`, metres from the element's middle (x, y) and
 * above its base (z). The eye looks toward the element's front (low y), goes with the element as it acts out
 * its state, and turns with the part named `part` when there is one (a camera's head). `sees` is how wide it
 * sees, in degrees from the bottom of its picture to the top. */
export interface LookOut {
  readonly at: { readonly x: number; readonly y: number; readonly z: number }
  readonly part?: string
  readonly sees: number
}

/** A STATE OF AN ELEMENT (22 Nov 2026, issue 127). The user: "I also think each [element] also have their own set
 * of controls that are specific to them. For example, the camera is used to view, so a drone is used to fly
 * around and hover on the different states of it. So I think we should also cater for those states and features
 * of an element." So an element may have states. Each has a name, says in a sentence what the element does in
 * it, and holds as data what that is; a thing made from the element acts it out (makeElement.ts), and the
 * gallery offers an element's states as that element's own control. What is left out of a state is at rest.
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
   * `bright` for that top face. */
  readonly glow?: {
    readonly colour: string
    readonly borders: ReadonlyArray<{ readonly piece: string; readonly faces?: 'up'; readonly colour?: string; readonly bright?: number; readonly sidesBright?: number }>
    readonly tops?: ReadonlyArray<{ readonly piece: string; readonly colour?: string; readonly bright?: number }>
  }
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
 * thing's own x, y and z, at which every socket of the piece is over a stud of the thing. Null when there is no
 * such place: the two must be on one grid (the same pitch and the same size of stud), and the piece's sockets
 * as deep as the studs are tall.
 * And where a thing goes on ground: the place the ground's data says, for a thing that stands by itself. */
export function fitsOn(piece: WorldElement, onto: WorldElement): { x: number; y: number; z: number } | null {
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
  const first = sockets?.at[0]
  if (!sockets || !studs || !first) return null
  const same = (a: number, b: number) => Math.abs(a - b) < 1e-9
  if (!same(sockets.pitch, studs.pitch) || !same(sockets.radius, studs.radius) || sockets.height < studs.height - 1e-9) return null
  for (const stud of studs.at) {
    const move = { x: stud.x - first.x, y: stud.y - first.y, z: stud.z - first.z }
    if (sockets.at.every(s => studs.at.some(t => same(t.x, s.x + move.x) && same(t.y, s.y + move.y) && same(t.z, s.z + move.z)))) return move
  }
  return null
}

/** The base tile: one tile for one 10 m by 10 m section of the land. */
export const BASE_TILE: WorldElement & { readonly shape: Slab; readonly border: Border } = {
  id: 'base-tile',
  name: 'Base tile',
  says: 'One tile covers one 10 m by 10 m section of the land.',
  size: { x: 10, y: 10, z: 0.2 },
  shape: { kind: 'slab', cornerRadius: 1 },
  surface: { colour: '--eio-color-world-land', finish: 'matte', says: 'matte black' },
  border: { width: 0.1, colour: '--eio-color-border-default' },
}

/** The astroid: the shape left open where four base tiles meet, two rows by two columns. Everything about its
 * shape comes from the base tile, so a change to the tile's corners or thickness changes it too. */
export const ASTROID: WorldElement & { readonly shape: Astroid } = {
  id: 'astroid',
  name: 'Astroid',
  says: 'It fills the middle where four base tiles meet, two rows by two columns.',
  size: { x: 2 * BASE_TILE.shape.cornerRadius, y: 2 * BASE_TILE.shape.cornerRadius, z: BASE_TILE.size.z },
  shape: { kind: 'astroid', radius: BASE_TILE.shape.cornerRadius },
  surface: { colour: '--eio-color-action-secondary', finish: 'matte', says: 'matte, in the secondary colour' },
}

// THE BASE PLATFORM (23 Nov 2026, issue 127). The user: "Let's add the base platform as element in the gallery
// too. So that I can select items to place on the platform just like we do in the drone." The base platform is
// the world's base as the user had it built (21 to 22 Nov 2026): 200 m across and 600 m long, a base tile on
// every 10 m by 10 m section, and an astroid wherever four tiles meet.
// FROM THE USER'S WORDS: it is an element in the gallery, and in its 3D view one chooses things to place on it,
// as one chooses what to set on the drone.
// MY PICKS, not the user's word: that the element is the whole platform and not a part of it; where a thing is
// placed (the middle of the tile beside the platform's middle, on the tile's top); that one thing is placed at
// a time, as on the drone; that what can be placed is whatever stands by itself (so not the camera module,
// which goes on studs, and not the tiles and astroids the platform is laid from).
// Like every element it stands by the middle of its base, so in the gallery its middle is x 0, y 0. On the land
// the same platform is counted from the middle of its beginning's side (land.ts); its size and how it is laid
// are the land's, and a test holds the two together.
const PLATFORM = { across: 210, long: 600 } as const // 21 tiles across since 23 Nov 2026 (piece 49), as the land
const platformThings: Array<{ element: WorldElement; at: { x: number; y: number } }> = (() => {
  const [stepX, stepY] = [BASE_TILE.size.x, BASE_TILE.size.y]
  const [hx, hy] = [PLATFORM.across / 2, PLATFORM.long / 2]
  const things: Array<{ element: WorldElement; at: { x: number; y: number } }> = []
  // a base tile on every section
  for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2 - hy; y < hy; y += stepY) things.push({ element: BASE_TILE, at: { x, y } })
  // an astroid wherever four tiles meet: at every corner of a section that is not on the platform's edge
  for (let x = stepX - hx; x < hx; x += stepX) for (let y = stepY - hy; y < hy; y += stepY) things.push({ element: ASTROID, at: { x, y } })
  return things
})()

/** The base platform: the whole base of the world, laid from base tiles and astroids. Things are placed on it. */
export const BASE_PLATFORM: WorldElement & { readonly shape: Laid; readonly ground: { readonly x: number; readonly y: number; readonly z: number; readonly step: number } } = {
  id: 'base-platform',
  name: 'Base platform',
  says: 'The base of the world: a base tile on every 10 m by 10 m section, and an astroid wherever four tiles meet. Other elements are placed on it.',
  size: { x: PLATFORM.across, y: PLATFORM.long, z: BASE_TILE.size.z },
  shape: {
    kind: 'laid',
    things: platformThings,
    says: `${platformThings.filter(t => t.element === BASE_TILE).length} base tiles, and ${platformThings.filter(t => t.element === ASTROID).length} astroids where four of them meet`,
  },
  surface: { ...BASE_TILE.surface, says: `${BASE_TILE.surface.says} tiles, astroids in the secondary colour` },
  // a thing is placed on the middle of a tile of the middle column (x 0), beside the platform's middle, on its top
  ground: { x: 0, y: BASE_TILE.size.y / 2, z: BASE_TILE.size.z, step: BASE_TILE.size.x },
}

// THE BASE PLATFORM AS A MÖBIUS STRIP (23 Nov 2026, issue 127, pieces 51 to 53). The user: "Now, what I want us
// to try is that to make the base platform of the world like a Mobius strip." First a round loop, whose tiles
// stretched and squeezed: "I want the tiles to be always a square? I mean, without deforming the current base
// tile what we have, and then we can have the strip as long as needed." Then a 7 km loop of straight runs and
// bends: "the strip is too long and not as smooth as the previous version ... Most parts feel like a plane
// without any curve. So yeah, maybe think about it again."
// FROM THE USER'S WORDS: a Möbius strip; 21 tiles across (x -105 to 105), as the land; every base tile square and
// as it is; shorter than 7 km and curving all the way round.
// MY PICKS, not the user's word: 2,400 m round, and the shape a search found (bend.ts): it bends only across its
// face and twists gently; a trial in the gallery, the world left as it is; tiles and astroids on BOTH faces, since
// a Möbius strip has one side only (go once round and one is on the underside); nothing can be set on it yet.
const MOBIUS_BEND: Bend = {
  kind: 'ribbon',
  long: 2400,
  across: PLATFORM.across,
  thick: 2 * BASE_TILE.size.z,
  bending: [3.080208, 0.314758, -0.033857, -1.058429, -1.767426, 0.921302, -1.469235],
  twisting: [-0.806171, -1.989551, -1.15165, 0.319887, 0.768751, 0.027262, -0.07992],
}
const mobiusThings: Array<{ element: WorldElement; at: { x: number; y: number }; under?: true }> = (() => {
  const [stepX, stepY] = [BASE_TILE.size.x, BASE_TILE.size.y]
  const [hx, long] = [MOBIUS_BEND.across / 2, lengthOf(MOBIUS_BEND)]
  const things: Array<{ element: WorldElement; at: { x: number; y: number }; under?: true }> = []
  for (const under of [false, true]) {
    const face = under ? { under: true as const } : {}
    for (let x = stepX / 2 - hx; x < hx; x += stepX) for (let y = stepY / 2; y < long; y += stepY) things.push({ element: BASE_TILE, at: { x, y }, ...face })
    // round the loop there is no first or last row: an astroid at every row's start, where the last row meets the first too
    for (let x = stepX - hx; x < hx; x += stepX) for (let y = 0; y < long; y += stepY) things.push({ element: ASTROID, at: { x, y }, ...face })
  }
  return things
})()

/** The base platform laid into a Möbius strip: square base tiles and astroids on both faces, curving and twisting
 * round to come back to its start turned over. */
export const MOBIUS_PLATFORM: WorldElement & { readonly shape: Laid & { readonly bend: Bend } } = {
  id: 'mobius-platform',
  name: 'Base platform, Möbius strip',
  says: `The base platform laid into a Möbius strip, ${lengthOf(MOBIUS_BEND).toLocaleString('en')} m round, curving all the way and every tile square. It has one side only. A trial: nothing is set on it yet.`,
  size: (() => { const s = bentSize(MOBIUS_BEND); return { x: Math.round(s.x * 10) / 10, y: Math.round(s.y * 10) / 10, z: Math.round(s.z * 10) / 10 } })(),
  shape: {
    kind: 'laid',
    things: mobiusThings,
    says: `${mobiusThings.filter(t => t.element === BASE_TILE).length} base tiles and ${mobiusThings.filter(t => t.element === ASTROID).length} astroids, half of them on each face`,
    bend: MOBIUS_BEND,
  },
  surface: { ...BASE_TILE.surface, says: `${BASE_TILE.surface.says} tiles, astroids in the secondary colour` },
}

// THE DRONE (22 Nov 2026, issue 127). Two tries came first (a six-sided body with two cuboids, then with four
// cubes). Shown them, the user, with a picture: "I did not like what we made. Let's use the following image as
// reference and use our [astroid] primitive". The picture is a drone seen from above: a body with four points
// and four sides curved inward, a round ring lying in each of the four curved sides, and two short joins from
// each ring to the body.
// FROM THE USER'S WORDS AND PICTURE: the body is our astroid primitive itself (its shape and its thickness are
// taken from ASTROID, so a change to it changes the drone); four rings, one in each curved side, so each
// ring's middle is the middle of the circle that side is a quarter of; a gap between ring and body; two joins
// across each gap.
// MY PICKS, not the user's word, read off the picture as shares of the astroid's radius: how large a ring is
// and how wide its band (DRONE_RING); how far apart, how long and how wide the joins are (DRONE_JOIN); that
// rings and joins are as thick as the astroid; and the look, matte white as the picture is (the picture is
// white on black; no colour was said).
const DRONE_RING = { outer: 0.84 * ASTROID.shape.radius, inner: 0.71 * ASTROID.shape.radius }
// CHANGED (23 Nov 2026, issue 127, piece 42). The user: "Keep this red, but there are connectors between the ring
// fans and the body, which are glitching. So I think what I want to do is instead of two connectors, let's make it
// one, and it has to be like a cylinder, smaller than the height of the body and wing circle." FROM THE USER'S
// WORDS: one join for each ring, a cylinder, thinner than the body and the ring are thick (both ASTROID.size.z).
// MY PICKS, not the user's word: it lies along the line from the ring's middle to the body's middle; it is half as
// thick across as the body and ring (`share`); its middle is at half their thickness; it starts in the ring's band
// (half-way between its inner and outer edge) and ends a tenth of a radius inside the body's curved side; matte
// black with the rings.
const DRONE_JOIN = (() => {
  const r = ASTROID.shape.radius
  return { share: 0.5, across: 0.5 * ASTROID.size.z, from: (DRONE_RING.outer + DRONE_RING.inner) / 2, to: r + 0.1 * r }
})()
// THE FANS (22 Nov 2026). The user: "I want you to figure out the fans for the drone." So all of this is MY
// DESIGN, none of it the user's word: a fan is a small astroid lying in a ring's opening and turning about the
// ring's middle, so that the drone is made of astroids and rings and nothing else, and a fan has four blades.
// Its points stop short of the ring; it is thinner than the ring, so it lies below the ring's rim; fans in
// neighbouring rings turn opposite ways, as a drone's do; one turn takes `turnEvery` seconds.
// CHANGED (22 Nov 2026), after seeing the fans: "Amazing. Can you also increase the fan speed? And reduce the
// Font size a little bit more." ("Font size" read as "fan size", dictated.) MY PICK, not the user's word: twice
// as fast (one turn in 0.4 s, was 0.8 s) and a little smaller (radius 0.55 of the astroid's, was 0.62).
// RECOLOURED (23 Nov 2026, issue 127, piece 41). The user: "I'm going with black for the world ... For the drone, I
// want the w- wings to be matte black. Sorry, glossy black, and the body to be red. Maybe we can choose something
// like crimson red, and the circles around the fans can be matte black." READ AS: wings = the four fans (glossy
// black, as the camera's lenses); body = the astroid and its four studs (red); circles around the fans = the four
// rings (matte black, as the base tile). MY PICKS, not the user's word: the joins go matte black with the rings; the
// body is matte; Eidos has no crimson, so the red is its nearest role, `--eio-color-text-danger`.
const DRONE_BLACK: Surface = { ...BASE_TILE.surface }
const DRONE_FAN_SURFACE: Surface = { colour: BASE_TILE.surface.colour, finish: 'glossy', says: 'glossy black' }
const DRONE_FAN = { radius: 0.55 * ASTROID.shape.radius, thick: 0.4 * ASTROID.size.z, turnEvery: 0.4 }

// THE STUDS ON THE BODY (22 Nov 2026). The user's words are with `Studs`, above: the drone is a primitive that
// later pieces attach to, by "a Lego style attachment setup on top of the body". FROM THE USER'S WORDS: studs,
// on top of the body.
// CHANGED (22 Nov 2026, issue 127), after seeing five studs: "I'm not sure why you have decided 5 stunts. If you
// have a better explanation, please do explain in simple terms. If not, I would have preferred 4 as a grid, and
// we can adapt that to other things that we build in the future." ("stunts" read as "studs", dictated.) FROM THE
// USER'S WORDS: four studs, as a grid (two by two, in a square), to be used again on other things later.
// MY PICK, not the user's word: the five in a plus was the session's design and is replaced; a plus cannot hold a
// square piece, and four in a square is the unit that can be repeated.
// MY PICK, not the user's word: the grid's numbers below (pitch 0.3 m; a stud 0.6 of the pitch across and 1.7
// eighths of the pitch tall, the toy's own proportions); and the square centred on the drone's middle, on top of
// the body.

/**
 * The one grid of studs for the whole world, so that a piece made for it fits on anything that has studs (the
 * user: "we can adapt that to other things that we build in the future"). MY PICK, not the user's word.
 * `pitch` is metres from one stud's middle to the next; `across` is a stud's width and `tall` its height, each as
 * a share of the pitch (the toy's own proportions).
 */
export const STUD_GRID = { pitch: 0.3, across: 0.6, tall: 1.7 / 8 } as const

const DRONE_STUDS: Studs = (() => {
  const pitch = STUD_GRID.pitch
  const z = ASTROID.size.z // on top of the body
  const near = pitch / 2
  const far = 0 - pitch / 2
  return {
    pitch,
    radius: (STUD_GRID.across * pitch) / 2,
    height: STUD_GRID.tall * pitch,
    at: [{ x: near, y: near, z }, { x: far, y: near, z }, { x: far, y: far, z }, { x: near, y: far, z }],
  }
})()

const dronePieces: Piece[] = [{ name: 'body', shape: ASTROID.shape, size: ASTROID.size, at: { x: 0, y: 0 } }]
// each stud: a round peg (a slab whose corners are rounded all the way), standing where the studs' data says
DRONE_STUDS.at.forEach((stud, n) => {
  dronePieces.push({
    name: `stud ${n + 1}`,
    shape: { kind: 'slab', cornerRadius: DRONE_STUDS.radius },
    size: { x: 2 * DRONE_STUDS.radius, y: 2 * DRONE_STUDS.radius, z: DRONE_STUDS.height },
    at: { x: stud.x, y: stud.y },
    up: stud.z,
  })
})
;([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).forEach(([sx, sy], n) => {
  const r = ASTROID.shape.radius
  const middle = { x: sx * r, y: sy * r }
  dronePieces.push({
    name: `ring ${n + 1}`,
    shape: { kind: 'ring', ...DRONE_RING },
    size: { x: 2 * DRONE_RING.outer, y: 2 * DRONE_RING.outer, z: ASTROID.size.z },
    at: middle,
    surface: DRONE_BLACK,
  })
  dronePieces.push({
    name: `fan ${n + 1}`,
    shape: { kind: 'astroid', radius: DRONE_FAN.radius },
    size: { x: 2 * DRONE_FAN.radius, y: 2 * DRONE_FAN.radius, z: DRONE_FAN.thick },
    at: middle,
    surface: DRONE_FAN_SURFACE,
    spin: { turnEvery: DRONE_FAN.turnEvery, way: sx * sy > 0 ? 1 : -1 },
  })
  // the way from the ring's middle to the drone's middle, in degrees from x toward y
  const inward = (Math.atan2(0 - sy, 0 - sx) * 180) / Math.PI
  const radians = (inward * Math.PI) / 180
  // ONE join, a round rod lying along that way: a round slab stood on its end (faces 'front') and turned so its
  // length runs along the diagonal; its middle at half the thickness of the body and ring, so it lies inside both
  dronePieces.push({
    name: `join ${n + 1}`,
    shape: { kind: 'slab', cornerRadius: DRONE_JOIN.across / 2 },
    size: { x: DRONE_JOIN.across, y: DRONE_JOIN.across, z: DRONE_JOIN.to - DRONE_JOIN.from },
    at: { x: middle.x + DRONE_JOIN.from * Math.cos(radians), y: middle.y + DRONE_JOIN.from * Math.sin(radians) },
    up: ASTROID.size.z / 2,
    faces: 'front',
    turn: inward + 90,
    surface: DRONE_BLACK,
  })
})

/** The drone, seen from above as in the user's picture: our astroid as its body, a ring in each curved side. */
export const DRONE: WorldElement & { readonly shape: Pieces } = {
  id: 'drone',
  name: 'Drone',
  says: 'Our astroid as its body, a round ring lying in each of its four curved sides with one round join to the body, in each ring a fan that turns, and on top of the body four studs that other pieces can be set on.',
  size: { x: 2 * (ASTROID.shape.radius + DRONE_RING.outer), y: 2 * (ASTROID.shape.radius + DRONE_RING.outer), z: ASTROID.size.z + DRONE_STUDS.height },
  shape: { kind: 'pieces', pieces: dronePieces, says: 'the astroid, four round rings, four round joins, four fans, each a small astroid that turns, and four round studs on top of the body' },
  surface: { colour: '--eio-color-text-danger', finish: 'matte', says: 'matte red, with matte black rings and glossy black fans' },
  studs: DRONE_STUDS,
  // THE DRONE'S STATES. The user: "a drone is used to fly around and hover on the different states of it." FROM
  // THE USER'S WORDS: it hovers, and it flies around. MY DESIGN: a third state in which it is landed, and it
  // starts there; every number (how high, how fast, how far round, how much it leans).
  states: [
    { id: 'landed', name: 'Landed', says: 'It stands on its place and its fans are still.', spin: 0 },
    { id: 'hovering', name: 'Hovering', says: 'It hangs over its place, rising and sinking a little, its fans turning.', lift: 0.8, bob: { by: 0.05, every: 2.4 }, spin: 1 },
    { id: 'flying', name: 'Flying', says: 'It flies round its place, leaning into its way, its fans turning faster.', lift: 1.2, bob: { by: 0.04, every: 1.6 }, round: { radius: 2.5, every: 7, lean: 12 }, spin: 1.4 },
  ],
}

// THE CAMERA MODULE (22 Nov 2026, issue 127). The user: "Now I think we should move to our next element. And that
// is camera. So the idea that I have is I want to have drones in the world roaming around attached with cameras
// on top of it." Shown four designs, they gave a picture of their own: "Here is the inspiration for a camera
// that I have. Can you build the camera module element?" The picture: on the middle of the drone's body a round
// foot with small lights round it, a short neck, and on it a wide head with round ends that looks to the front:
// a dark face with two lenses side by side, a small light between them, and a strip of light along its top.
// FROM THE USER'S WORDS AND PICTURE: those parts, and that it goes on the drone by the studs (its foot has four
// sockets on the studs' grid, `sockets`; `fitsOn` says where it then stands).
// MY PICKS, not the user's word, read off the picture: every size below (CAMERA); that the foot is two round
// steps; twelve lights; the lights in the primary colour (the picture's are white, which does not show on a
// white thing in this light); that its front is toward low y, as every element's is.
// ADDED 22 Nov 2026 (issue 127). The user, after seeing the camera module: "Can you also add subtle lime rings
// for the two camera rings?" FROM THE USER'S WORDS: a subtle lime ring on each of the two lenses. MY PICK, not
// the user's word: that "the two camera rings" are the two lenses; one thin ring each, in the primary colour,
// lit (`CAMERA_LIGHT`); lying on the lens's front, round the glass; its width and thickness (`lensRing`),
// thinner than the lens's own band so that it is subtle.
// THE BASE CHANGED (22 Nov 2026, issue 127). The user: "Basically the camera module as an element is supposed to
// fit on the drone as a Lego. So what I want you to do is the base of the camera module should be a cuboid with
// all four sides same, keeping the same height, but with border radius, and also the bottoms that can fit the
// studs." FROM THE USER'S WORDS: the base is a block whose four sides are the same, as tall as the round foot
// was (0.1 m), its corners rounded, and underneath it has holes the studs go into. MY PICKS, not the user's
// word: its sides are two steps of the studs' grid long (0.6 m, as the toy's two-by-two brick is); how round
// its corners are; a hole as wide as a stud and as deep as a stud is tall; that the smaller round plate stays
// on the base, under the neck; three lights on each of its four sides.
const CAMERA = {
  /** The base: a block with four equal sides and rounded corners, with the sockets underneath; and the smaller
   * round plate on it. */
  base: { side: 2 * STUD_GRID.pitch, corner: 0.2 * STUD_GRID.pitch, tall: 0.1 },
  plate: { radius: 0.9 * STUD_GRID.pitch, tall: 0.05 },
  neck: { radius: 0.11, tall: 0.19 },
  /** The head, seen from the front: so wide, so tall, its ends round; and so deep from front to back. */
  head: { wide: 1, tall: 0.42, deep: 0.44 },
  /** The dark face on the head's front, standing `proud` of it. */
  face: { wide: 0.9, tall: 0.32, proud: 0.012 },
  /** The two lenses: their middles `apart`, each a ring with glass in it. */
  lens: { apart: 0.5, outer: 0.125, inner: 0.095, proud: 0.05, glassProud: 0.02 },
  /** A thin ring of light on each lens's front, round the glass: `wide` from the glass out, `proud` thick. */
  lensRing: { wide: 0.012, proud: 0.002 },
  /** The lights on the base's sides (`each` on every side, `apart` from one to the next), the light between the
   * lenses, and the strip along the head's top. */
  lights: { each: 3, apart: STUD_GRID.pitch / 2, wide: 0.03, tall: 0.045, proud: 0.012, up: 0.028 },
  bar: { wide: 0.07, tall: 0.014, proud: 0.004 },
  strip: { long: 0.34, wide: 0.02, tall: 0.006, forward: 0.08 },
} as const
const CAMERA_GLASS: Surface = { colour: '--eio-color-world-land', finish: 'glossy', says: 'glossy black' }
const CAMERA_LIGHT: Surface = { colour: '--eio-color-action-primary', finish: 'lit', says: 'lit, in the primary colour' }
/** Where the camera module takes the studs of what it is set on: four sockets in a square on the studs' grid,
 * each as wide as a stud and as deep as a stud is tall. */
const CAMERA_SOCKETS: Studs = {
  pitch: STUD_GRID.pitch,
  radius: (STUD_GRID.across * STUD_GRID.pitch) / 2,
  height: STUD_GRID.tall * STUD_GRID.pitch,
  at: [[1, 1], [-1, 1], [-1, -1], [1, -1]].map(([sx, sy]) => ({ x: (sx! * STUD_GRID.pitch) / 2, y: (sy! * STUD_GRID.pitch) / 2, z: 0 })),
}

const cameraPieces: Piece[] = (() => {
  const c = CAMERA
  const round = (radius: number, tall: number) => ({ shape: { kind: 'slab', cornerRadius: radius } as const, size: { x: 2 * radius, y: 2 * radius, z: tall } })
  const plateUp = c.base.tall
  const square = { x: c.base.side, y: c.base.side }
  const neckUp = plateUp + c.plate.tall
  // the head's middle, as high as the neck's top and half the head; its front and its back, either side of y 0
  const headUp = neckUp + c.neck.tall + c.head.tall / 2
  const [back, front] = [c.head.deep / 2, 0 - c.head.deep / 2]
  const onFace = front - c.face.proud
  const pieces: Piece[] = [
    // the base is one block drawn as two parts: the lower as deep as the sockets, with a round hole for each
    // (so the holes are open underneath), and the upper closed above them
    { name: 'base', shape: { kind: 'slab', cornerRadius: c.base.corner, holes: CAMERA_SOCKETS.at.map(s => ({ x: s.x, y: s.y, radius: CAMERA_SOCKETS.radius })) }, size: { ...square, z: CAMERA_SOCKETS.height }, at: { x: 0, y: 0 } },
    { name: 'base top', shape: { kind: 'slab', cornerRadius: c.base.corner }, size: { ...square, z: c.base.tall - CAMERA_SOCKETS.height }, at: { x: 0, y: 0 }, up: CAMERA_SOCKETS.height },
    { name: 'plate', ...round(c.plate.radius, c.plate.tall), at: { x: 0, y: 0 }, up: plateUp },
    { name: 'neck', ...round(c.neck.radius, c.neck.tall), at: { x: 0, y: 0 }, up: neckUp },
    { name: 'head', part: 'head', shape: { kind: 'slab', cornerRadius: c.head.tall / 2 }, size: { x: c.head.wide, y: c.head.tall, z: c.head.deep }, at: { x: 0, y: back }, up: headUp, faces: 'front' },
    { name: 'face', part: 'head', shape: { kind: 'slab', cornerRadius: c.face.tall / 2 }, size: { x: c.face.wide, y: c.face.tall, z: c.face.proud }, at: { x: 0, y: front }, up: headUp, faces: 'front', surface: CAMERA_GLASS },
    { name: 'light between the lenses', part: 'head', shape: { kind: 'slab', cornerRadius: c.bar.tall / 2 }, size: { x: c.bar.wide, y: c.bar.tall, z: c.bar.proud }, at: { x: 0, y: onFace }, up: headUp, faces: 'front', surface: CAMERA_LIGHT },
    { name: 'light along the top', part: 'head', shape: { kind: 'slab', cornerRadius: c.strip.wide / 2 }, size: { x: c.strip.long, y: c.strip.wide, z: c.strip.tall }, at: { x: 0, y: 0 - c.strip.forward }, up: headUp + c.head.tall / 2, surface: CAMERA_LIGHT },
  ]
  for (const [n, side] of ([-1, 1] as const).entries()) {
    const at = { x: (side * c.lens.apart) / 2, y: onFace }
    pieces.push({ name: `lens ${n + 1}`, part: 'head', shape: { kind: 'ring', outer: c.lens.outer, inner: c.lens.inner }, size: { x: 2 * c.lens.outer, y: 2 * c.lens.outer, z: c.lens.proud }, at, up: headUp, faces: 'front', surface: CAMERA_GLASS })
    pieces.push({ name: `lens ring ${n + 1}`, part: 'head', shape: { kind: 'ring', outer: c.lens.inner + c.lensRing.wide, inner: c.lens.inner }, size: { x: 2 * (c.lens.inner + c.lensRing.wide), y: 2 * (c.lens.inner + c.lensRing.wide), z: c.lensRing.proud }, at: { x: at.x, y: at.y - c.lens.proud }, up: headUp, faces: 'front', surface: CAMERA_LIGHT })
    pieces.push({ name: `glass ${n + 1}`, part: 'head', shape: { kind: 'slab', cornerRadius: c.lens.inner }, size: { x: 2 * c.lens.inner, y: 2 * c.lens.inner, z: c.lens.glassProud }, at, up: headUp, faces: 'front', surface: CAMERA_GLASS })
  }
  // the lights on the base's four sides: each a small upright bar half in the side and half out of it
  for (let side = 0; side < 4; side++) {
    const turn = side * 90
    // which way this side faces, and the way along it
    const out = ([[1, 0], [0, 1], [-1, 0], [0, -1]] as const)[side]!
    const along = ([[0, 1], [-1, 0], [0, -1], [1, 0]] as const)[side]!
    for (let n = 0; n < c.lights.each; n++) {
      const off = (n - (c.lights.each - 1) / 2) * c.lights.apart
      pieces.push({
        name: `base light ${side * c.lights.each + n + 1}`,
        shape: { kind: 'slab', cornerRadius: 0 },
        size: { x: 2 * c.lights.proud, y: c.lights.wide, z: c.lights.tall },
        at: { x: (out[0] * c.base.side) / 2 + along[0] * off, y: (out[1] * c.base.side) / 2 + along[1] * off },
        turn,
        up: c.lights.up,
        surface: CAMERA_LIGHT,
      })
    }
  }
  return pieces
})()

/** The camera module: a square base that goes on four studs, a neck, and a head that looks to the front. */
export const CAMERA_MODULE: WorldElement & { readonly shape: Pieces; readonly sockets: Studs } = {
  id: 'camera-module',
  name: 'Camera module',
  says: 'A square base with rounded corners and lights on its sides, a short neck, and a wide head that looks to the front with two lenses side by side, each with a thin ring of light round it. Underneath, the base has four sockets that go on four studs.',
  // along y it reaches as far as the base and the lights that stand out of the base's sides
  size: { x: CAMERA.head.wide, y: CAMERA.base.side + 2 * CAMERA.lights.proud, z: CAMERA.base.tall + CAMERA.plate.tall + CAMERA.neck.tall + CAMERA.head.tall + CAMERA.strip.tall },
  shape: { kind: 'pieces', pieces: cameraPieces, says: 'a square base with rounded corners and four sockets underneath, a round plate, a neck, a head with round ends facing the front, a dark face with two lenses, a thin ring of light round each lens, and small lights' },
  // RECOLOURED (23 Nov 2026, piece 41): "in camera module, the two cameras part is glossy black, which is nice. I like it,
  // but I want rest of the body to be matte black." The body takes the base tile's black and matte finish.
  surface: { ...BASE_TILE.surface, says: 'matte black, with glossy black glass and lights in the primary colour' },
  sockets: CAMERA_SOCKETS,
  // THROUGH THE CAMERA. The user: "Also add Camera view, I mean, through the camera." FROM THE USER'S WORDS: one
  // can look through it. MY PICKS: the eye is mid-way between the two lenses, just before their fronts, so
  // nothing of the camera is in its own way; it turns with the head; how wide it sees.
  lookOut: {
    at: { x: 0, y: 0 - CAMERA.head.deep / 2 - CAMERA.face.proud - CAMERA.lens.proud - CAMERA.lensRing.proud - 0.01, z: CAMERA.base.tall + CAMERA.plate.tall + CAMERA.neck.tall + CAMERA.head.tall / 2 },
    part: 'head',
    sees: 60,
  },
  // THE CAMERA MODULE'S STATES. The user: "the camera is used to view". FROM THE USER'S WORDS: a state in which
  // it views. MY DESIGN: that viewing is its head turning slowly from side to side on its neck (the head, its
  // face, lenses and lights are one part, `head`); a state of rest, in which it starts; the numbers.
  states: [
    { id: 'resting', name: 'Resting', says: 'Its head is still, looking to the front.' },
    { id: 'viewing', name: 'Viewing', says: 'Its head turns slowly from side to side, looking round.', sweep: { part: 'head', by: 40, every: 6 } },
  ],
}

// THE STAGE (23 Nov 2026, issue 127). The user, with a picture: "The next element I want you to build is the
// stage. It's the image that I have provided. It's a stage". The picture, seen from above at an angle on a dark
// ground: a low square block with rounded corners, all of it lime light, into which one sees from above (its far
// walls from the inside, and its floor); and floating above it a thin dark sheet with the same outline, like
// frosted glass: what is behind it shows through it softened, and along one of its edges runs a thin bright line.
// FROM THE USER'S PICTURE: the two parts and their one outline; that the block is light and one sees into it
// from above; its three tones (the walls that look one way are the lime itself, the walls that look the other
// way are pale, the floor is between the two); that the sheet floats about as far above the block as the block
// is tall; the sheet's look.
// MY PICKS, not the user's word: that the outline is our base tile's (so a stage stands on exactly one tile:
// 10 m by 10 m, corners rounded by 1 m; the picture's corners are about that round); how tall the block is,
// how far above it the sheet floats (both read off the picture as shares of its width) and how thick the sheet
// is (STAGE_SIZES); the colours (Eidos's primary colour for the light, made pale toward the world's white; that
// white for the glass); how much the glass hides. It has no states and no studs: the user has not said what a
// stage does. The soft glow round the block in the picture is not made.
// THE BLOCK IN THE BASE TILE'S STYLE (23 Nov 2026, issue 127). The user, after seeing the stage as a block of
// lime light: "I like what you did, but I want to [adopt] the base tile style. Texture and border for the block.
// Can you try that?" FROM THE USER'S WORDS: the block has the base tile's texture and the base tile's border. So
// the block's surface and its border are taken from BASE_TILE itself (a change to the tile's style changes the
// stage's block too), and it is a whole block with a top, as a tile is.
// MY PICK, not the user's word: that the tile's "texture" takes in its colour, so the block is matte black and
// no longer lime light. AGREED 23 Nov 2026: "keep it black".
//
// THE STAGE'S STATES (23 Nov 2026, issue 127). The user: "keep it black, but let's have an active state and
// default state. The active state should have the top face border and the glass slab border glow as lime."
// FROM THE USER'S WORDS: two states, default and active; in the active one the border of the block's top face
// and the border of the glass slab glow lime (Eidos's primary colour).
// MY PICKS, not the user's word: that the stage starts in the default state; that the glass slab's border is as
// wide as the block's (the base tile's 0.1 m), is glass like the rest of the slab while it is not lit, and
// glows on all of it (above, below and its thin edge); that of the block's border only the top face glows and
// its walls stay as they are; what each state says of itself.
// THE TOP FACE TOO (23 Nov 2026). The user, after seeing the active state: "The top face of the base cube block
// also should glow with lime. Let's try that." FROM THE USER'S WORDS: in the active state the whole top face of
// the block glows lime as well. MY PICK, not the user's word: as bright as its border, so on the top face the
// border no longer stands apart.
// THE SIDES TOO (23 Nov 2026). The user, after seeing that: "I think let's glow the sides too". FROM THE USER'S
// WORDS: in the active state the block's sides glow lime as well, so the whole block does. MY PICKS, not the
// user's word: a side is a little paler than the top, by which way it looks (toward the world's white: 0.25
// where it looks along y, 0.45 where it looks along x; the tones of the stage's first look), because a block
// lit the same on every face shows no shape; the glass's thin edge takes the same tones.
// COLOURS TO PLAY WITH (23 Nov 2026). The user: "I actually love the active state of the stage, but I want to
// play with colors on the sides, border, top face, the glass slab. So in the element of [stage], can you add
// these controls so that I can just play around and see what works and what doesn't work?" FROM THE USER'S
// WORDS: the active state is liked; four colours of the stage can be tried out, each by itself: the sides, the
// border, the top face, the glass slab. MY PICKS, not the user's word: that "border" is the border of the
// block's top face, and "the glass slab" is the light of the glass's border; that each begins as lime; that a
// side is paler only as far as its colour is bright, so that a dark colour tried on the sides stays dark (the
// two numbers of `sides` below were 0.45 and 0.25 and are now those divided by lime's brightness, 0.855, so
// that lime looks exactly as it did).
// THAT WAS A MISREADING (23 Nov 2026). The user: "By the way, I did not mean selecting different colors, but I
// meant what controls can we have on the material, the light, and the glass." Shown a list of controls in those
// three groups, each a few steps: "Yes, add them". FROM THE USER'S WORDS: controls on the material, the light
// and the glass; the list below is the one they agreed to. MY PICKS, not the user's word: every step's number
// and name (STAGE's `settings`). Asked whether the colours to try should go: "No. Keep them."
// ONE COLOUR FOR ALL PARTS (23 Nov 2026). The user, having tried them: "I don't need individual color selection.
// One color applied to all parts of the stage." FROM THE USER'S WORDS: the stage has one colour to try, and
// every part its active state lights gives off that one. MY PICK, not the user's word: what the one choice is
// called ("All parts"; since then "Colour", the user's own word).
// THE SETTINGS FIXED, AND A SIZE TO CHOOSE (23 Nov 2026). The user, with a picture of the stage's card as they
// had set it (Shine: Glossy. Top face: Half. Border: Full. Sides: Half. Sides, how pale: Not at all. Border's
// spill: None. Frost: Heavy. Hides: Nothing. Above the block: 1 m. The glass's border: Full. Colour: lime):
// "Now, these are the settings I want you to fix for the stage. Only controls we need are colour, width, breadth
// and height. The height is only for base. Sizes are steps of 10m."
// FROM THE USER'S WORDS AND PICTURE: every number of the look below (the block shines as glossy; its top face
// and its sides are lit half as brightly as its border; lit sides are no paler; a lit border spills no light;
// the glass is heavily frosted, hides nothing, and floats 1 m above the block; its border is lit fully). The
// controls for those are gone. What one may choose: the colour, the width, the breadth, and the height of the
// base only; sizes go in steps of 10 m.
// MY PICKS, not the user's word: width is along x and breadth along y; each from 10 m to 100 m; a stage two
// tiles wide or more keeps the tile's corners and border; the glass stays 1 m above the base whatever the
// base's height.
// THE BASE'S HEIGHTS (23 Nov 2026). The height first offered the 1.6 m the base had (a session's pick, read off
// the first picture), then 10 m to 50 m. The user: "Is there any reason why the first step height for the base
// is 1.6 meters? Going straight away to 10 is also not feeling good. So probably we can have some numbers like
// starting with 2, then 4, then 8, and then 10." FROM THE USER'S WORDS: the base's heights are 2 m, 4 m, 8 m
// and 10 m. MY PICKS, not the user's word: that the base is made 2 m tall (the first of them; it was 1.6 m);
// that nothing taller than 10 m is offered.
// THE BORDER GROWS WITH THE HEIGHT (23 Nov 2026). The user, of the same change: "At the same time, we should make
// the border relative to its height." FROM THE USER'S WORDS: the border's width follows the base's height. MY
// PICKS, not the user's word: by how much (a twentieth of the height, so the 2 m base has exactly the base
// tile's border, 0.1 m, and a 10 m base one of 0.5 m); that the glass's border stays as wide as the block's.
// THE GLASS FOLLOWS THE HEIGHT TOO (23 Nov 2026). The user, shown that: "I think the height of the glass slab
// should also be relative to the height of the base." FROM THE USER'S WORDS: the glass slab's height follows
// the base's height. MY PICKS, not the user's word: that this is both how far above the base the slab floats
// and how thick it is (the word can mean either); each in the share it has on the 2 m base (half the base's
// height above it, and a fortieth of it thick), so a taller stage keeps the proportions of the one fixed.
// CORRECTED (23 Nov 2026). The user: "I did not mean the gap between base and the glass. I think that relative
// value should be quite low. But I meant the thickness of it. And then also I think you should also reduce the
// relative constant of the border too." FROM THE USER'S WORDS: it is the glass's thickness that follows the
// base's height; the gap grows only a little with it; the border grows less than it did. MY PICKS, not the
// user's word: how much each takes of the base's growth (STAGE_GROWS: the thickness all of it, the border half
// of it, the gap a tenth of it), each from its number on the 2 m base, which stays as the user fixed it.
// FOUR POSTS (23 Nov 2026, piece 43, issue 127). The user: "the glass for the stage is hovering. Doesn't feel as
// good as I want it to be. So what I want you to do is the border radius of the base is 1 meter, right? So at
// the center of that 1 meter border radius, that is like 0.5 meters from the corner, let's add cylinders
// connecting the glass and the base on all the four corners." ("class" read as "glass", dictated.) FROM THE
// USER'S WORDS: four cylinders, one at each corner, joining the glass to the base; each 0.5 m in from the two
// sides that meet at its corner (half the corner's radius, worked out from it), so a post at the 10 m by 10 m
// stage stands at x 4.5, y 4.5, z 2 (and the other three by sign).
// MY PICKS, not the user's word: each post is 0.4 m across (inside the rounded corner); in the block's own
// style (glossy black, no border); each stands on the block's top and is as long as the gap to the glass, so it
// follows the gap at every base height; in the active state it stays dark (the light is on the block and the
// glass's border, which the posts do not have).
// POSTS LIKE THE SIDES, AND 1 M IN (23 Nov 2026, piece 44). The user: "The posts should have the material and
// color of the sides, and I think we should push the posts to 1 meter inside from left and right of the corner."
// FROM THE USER'S WORDS: each post has the surface of the block's sides (the border's colour and shine, taken
// from BASE_TILE), and lights as the sides do in the active state (the sides' brightness, the one colour); each
// stands 1 m in from the two sides at its corner, which is the corner's radius itself, worked out from it: at
// the 10 m stage x 4, y 4, z 2 (and the other three by sign). The old 0.5 m is gone. (The posts have no border:
// a glow may name a piece without one, and then lights all of that piece.)
const STAGE_POST = { across: 0.4 } as const
/** How much of the base's growth each of these takes: 1 grows as the base does, 0 not at all. */
const STAGE_GROWS = { glass: 1, border: 0.5, gap: 0.1 } as const
const STAGE_SIZES = { tall: 2, gap: 1, glass: 0.05 } as const
/** The heights one may choose for the stage's base, in metres: the user's own numbers ("starting with 2, then 4,
 * then 8, and then 10"; and 6, 23 Nov 2026, piece 51, after laying stages 6 m tall: "Yeah, let's do it."). */
const BASE_HEIGHTS = [2, 4, 6, 8, 10] as const
const STAGE_GLASS: Surface = { colour: '--eio-color-world-wall', finish: 'frosted', hides: 0, frost: 0.85, says: 'heavily frosted glass' }
/** The sizes one may choose, in metres: steps of 10 m. */
const TENS = Array.from({ length: 10 }, (_, n) => 10 * (n + 1))
const inMetres = (value: number) => ({ name: `${value} m`, value })

/** The stage in a size: so wide along x, so long along y, its base so tall. */
function stageOf(to: Size): WorldElement & { readonly shape: Pieces } {
  const flat = { x: to.x, y: to.y }
  // how many times as tall the base is as the one the stage is made with. A number of that stage, grown for
  // this base: by all of the base's growth (`share` 1), by none of it (0), or by a part of it; to the millimetre
  const taller = to.z / STAGE_SIZES.tall
  const grown = (metres: number, share: number) => Math.round(metres * (1 + share * (taller - 1)) * 1000) / 1000
  const border = { ...BASE_TILE.border, width: grown(BASE_TILE.border.width, STAGE_GROWS.border) }
  const [gap, glass] = [grown(STAGE_SIZES.gap, STAGE_GROWS.gap), grown(STAGE_SIZES.glass, STAGE_GROWS.glass)]
  return {
    id: 'stage',
    name: 'Stage',
    says: 'A block in the style of a base tile, with its outline and its border, glossy, and a sheet of heavily frosted glass with the same outline floating above it.',
    size: { ...flat, z: to.z + gap + glass },
    shape: {
      kind: 'pieces',
      pieces: [
        { name: 'block', shape: BASE_TILE.shape, size: { ...flat, z: to.z }, at: { x: 0, y: 0 }, border },
        { name: 'glass', shape: BASE_TILE.shape, size: { ...flat, z: glass }, at: { x: 0, y: 0 }, up: to.z + gap, surface: STAGE_GLASS, border: { width: border.width, colour: STAGE_GLASS.colour, surface: STAGE_GLASS } },
        ...([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy], n): Piece => ({
          name: `post ${n + 1}`,
          shape: { kind: 'slab', cornerRadius: STAGE_POST.across / 2 },
          size: { x: STAGE_POST.across, y: STAGE_POST.across, z: gap },
          // the corner's radius in from each of the two sides, so on the corner's own diagonal
          at: { x: sx * (to.x / 2 - BASE_TILE.shape.cornerRadius), y: sy * (to.y / 2 - BASE_TILE.shape.cornerRadius) },
          up: to.z,
          // the material and colour of the block's sides (its border's walls): the same surface
          surface: { colour: BASE_TILE.border.colour, finish: 'matte', shine: 1, says: 'glossy, as the block\'s sides' },
        })),
      ],
      says: `a block with the base tile's corners and a border ${border.width} m wide, a thin sheet of glass with the same outline floating ${gap} m above it, and a round post at each corner joining the two`,
    },
    // the tile's own colour and finish (a change to the tile's style changes the block), made to shine
    surface: { ...BASE_TILE.surface, shine: 1, says: 'glossy black, under heavily frosted glass' },
    states: [
      { id: 'default', name: 'Default', says: 'It stands dark, in the base tile\'s style.' },
      {
        id: 'active',
        name: 'Active',
        says: 'The whole block glows, its border fully and its top and its sides half as brightly, and so does the border of the glass.',
        glow: {
          colour: '--eio-color-action-primary',
          borders: [
            { piece: 'block', colour: 'light', bright: 1, sidesBright: 0.5 },
            { piece: 'glass', colour: 'light', bright: 1 },
            // the posts light as the block's sides do
            ...[1, 2, 3, 4].map(n => ({ piece: `post ${n}`, colour: 'light', bright: 0.5, sidesBright: 0.5 })),
          ],
          tops: [{ piece: 'block', colour: 'light', bright: 0.5 }],
        },
      },
    ],
    colours: [{ id: 'light', name: 'Colour', colour: '--eio-color-action-primary' }],
    settings: [
      { id: 'width', group: 'Size', name: 'Width', sets: { what: 'size', along: 'x' }, steps: TENS.map(inMetres), value: to.x },
      { id: 'breadth', group: 'Size', name: 'Breadth', sets: { what: 'size', along: 'y' }, steps: TENS.map(inMetres), value: to.y },
      { id: 'height', group: 'Size', name: 'Height of the base', sets: { what: 'size', along: 'z' }, steps: BASE_HEIGHTS.map(inMetres), value: to.z },
    ],
    sized: stageOf,
  }
}

/** The stage: a glossy block in the base tile's style, as wide as one tile, and a sheet of heavily frosted
 * glass floating above it. */
export const STAGE: WorldElement & { readonly shape: Pieces } = stageOf({ x: BASE_TILE.size.x, y: BASE_TILE.size.y, z: STAGE_SIZES.tall })

/** Every element of the world. The gallery shows them all, in this order. */
/** The base platform laid as a wave and a circular twist (issue 130, wavePlatform.ts). */
export const WAVE_PLATFORM = wavePlatform(BASE_TILE, ASTROID)
export const ELEMENTS: readonly WorldElement[] = [BASE_TILE, ASTROID, BASE_PLATFORM, MOBIUS_PLATFORM, WAVE_PLATFORM, DRONE, CAMERA_MODULE, STAGE]

export function elementById(id: string): WorldElement | null {
  return ELEMENTS.find(e => e.id === id) ?? null
}

/** A length in words: to the millimetre at the finest, with no long tail. */
const metres = (n: number) => String(Math.round(n * 1000) / 1000)

/** An element's size in words: a solid is so tall, a flat piece so thick. */
export function sizeWords(e: WorldElement): string {
  return `${metres(e.size.x)} m along x, ${metres(e.size.y)} m along y, ${metres(e.size.z)} m ${e.shape.kind === 'solid' || (e.shape.kind === 'laid' && e.shape.bend) ? 'tall' : 'thick'}`
}

/** A kind of shape that one of the three choices below has no answer for: the type check stops here until
 * every choice (words, ground covered, outline) names every kind. */
function noSuchShape(shape: never): never {
  throw new Error(`A kind of shape nothing here can draw: ${JSON.stringify(shape)}`)
}

/** An element's shape in words. */
export function shapeWords(e: WorldElement): string {
  switch (e.shape.kind) {
    case 'slab': return `corners rounded by ${e.shape.cornerRadius} m`
    case 'astroid': return `four points ${e.shape.radius} m from its middle, sides curved inward by ${e.shape.radius} m`
    case 'ring': return `a round ring ${metres(e.shape.outer)} m out from its middle, its band ${metres(e.shape.outer - e.shape.inner)} m wide`
    case 'solid': return e.shape.says
    case 'pieces': return e.shape.says
    case 'laid': return e.shape.says
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

/** An element's lit edges in words, or null when it has none. */
export function edgesWords(e: WorldElement): string | null {
  return e.edges ? e.edges.says : null
}

/** All of an element in words: its size, its shape, its surface, and its border and lit edges when it has them. */
export function inWords(e: WorldElement): string {
  return [sizeWords(e), shapeWords(e), surfaceWords(e), borderWords(e), edgesWords(e), e.cutEdge?.says ?? null, e.orbit?.says ?? null, e.turning?.says ?? null].filter(part => part !== null).join('; ')
}

/** Whether a spot of ground, `dx` and `dy` metres from an element's middle, is under the element. */
export function covers(e: WorldElement, dx: number, dy: number): boolean {
  const [ax, ay] = [Math.abs(dx), Math.abs(dy)]
  const [hx, hy] = [e.size.x / 2, e.size.y / 2]
  if (ax > hx || ay > hy) return false
  switch (e.shape.kind) {
    case 'slab': {
      // all of the rectangle, less what each rounded corner leaves open
      const r = Math.min(e.shape.cornerRadius, hx, hy)
      return !(ax > hx - r && ay > hy - r && Math.hypot(ax - (hx - r), ay - (hy - r)) > r)
    }
    case 'astroid':
      // what is outside all four circles whose quarters are its sides
      return Math.hypot(ax - e.shape.radius, ay - e.shape.radius) >= e.shape.radius
    case 'ring': {
      // the band between its two circles
      const out = Math.hypot(dx, dy)
      return out >= e.shape.inner && out <= e.shape.outer
    }
    case 'solid':
      // the ground under any part of it
      return inside(footprint(e.shape.points), dx, dy)
    case 'pieces':
      // the ground it takes up: all that lies within the outline round its pieces, the gaps between them too
      return inside(roundPieces(e.shape), dx, dy)
    case 'laid':
      // the ground it takes up: all that lies within the outline round what it is laid from
      return inside(roundLaid(e.shape), dx, dy)
    default:
      return noSuchShape(e.shape)
  }
}

/** Whether a spot of ground, `dx` and `dy` metres from an element's middle, is under the element's border. */
export function inBorder(e: WorldElement, dx: number, dy: number): boolean {
  const within = withinBorder(e)
  return within !== null && covers(e, dx, dy) && !covers(within, dx, dy)
}

/** What of an element lies inside its border: the same shape, smaller by the border's width all round, its
 * corners rounded by that much less. Null when the element has no border. Only a slab can have one so far. */
export function withinBorder(e: WorldElement): WorldElement | null {
  if (!e.border || e.shape.kind !== 'slab') return null
  const w = e.border.width
  return {
    ...e,
    size: { x: e.size.x - 2 * w, y: e.size.y - 2 * w, z: e.size.z },
    shape: { kind: 'slab', cornerRadius: Math.max(0, e.shape.cornerRadius - w) },
    border: undefined,
  }
}

/** What of a piece lies inside its border: the same piece, smaller by the border's width all round, its corners
 * rounded by that much less. Null when the piece has no border. Only a slab can have one. */
export function withinPieceBorder(piece: Piece): Piece | null {
  if (!piece.border || piece.shape.kind !== 'slab') return null
  const w = piece.border.width
  return {
    ...piece,
    size: { x: piece.size.x - 2 * w, y: piece.size.y - 2 * w, z: piece.size.z },
    shape: { ...piece.shape, cornerRadius: Math.max(0, piece.shape.cornerRadius - w) },
    border: undefined,
  }
}

/** How many straight pieces draw one rounded corner. */
export const CORNER_PIECES = 24

/** An element's outline seen from above, as points in metres round 0, 0 (x, y), going round against the clock. */
export function outline(e: WorldElement, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  switch (e.shape.kind) {
    case 'slab':
    case 'astroid':
    case 'ring': return flatOutline(e.shape, e.size, pieces)
    case 'solid': return footprint(e.shape.points)
    case 'pieces': return roundPieces(e.shape, pieces)
    case 'laid': return roundLaid(e.shape)
    default: return noSuchShape(e.shape)
  }
}

/** A flat shape's outline seen from above, round 0, 0, going round against the clock. A ring's is its outer
 * circle; what it leaves open is in `holesOf`. */
export function flatOutline(shape: Flat, size: Size, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  switch (shape.kind) {
    case 'slab': return slabOutline(size, shape, pieces)
    case 'astroid': return astroidOutline(shape, pieces)
    case 'ring': return circle(shape.outer, pieces)
    default: return noSuchShape(shape)
  }
}

/** What a flat shape leaves open inside its outline: for a ring, its inner circle; for a slab, its round holes. */
export function holesOf(shape: Flat, pieces = CORNER_PIECES): Array<Array<{ x: number; y: number }>> {
  if (shape.kind === 'ring') return [circle(shape.inner, pieces)]
  if (shape.kind === 'slab') return (shape.holes ?? []).map(hole => circle(hole.radius, pieces).map(p => ({ x: hole.x + p.x, y: hole.y + p.y })))
  return []
}

/** A circle as points round 0, 0, against the clock: four times as many straight pieces as a rounded corner has. */
function circle(r: number, pieces: number) {
  return Array.from({ length: 4 * pieces }, (_, i) => {
    const a = (i / (4 * pieces)) * 2 * Math.PI
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

/** Points of a piece's own shape, as they are where the piece stands inside its element: turned, then moved
 * to its place. */
function inElement(piece: Piece, points: ReadonlyArray<{ x: number; y: number }>) {
  const a = ((piece.turn ?? 0) * Math.PI) / 180
  return points.map(p => ({
    x: piece.at.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: piece.at.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  }))
}

/** One piece's outline seen from above, where the piece stands inside its element. A piece that faces the
 * front is seen from above as the strip it is raised through: as wide as its outline, from its base forward. */
export function pieceOutline(piece: Piece, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  if (piece.faces === 'front') {
    const [half, deep] = [piece.size.x / 2, piece.size.z]
    return inElement(piece, [{ x: 0 - half, y: 0 - deep }, { x: half, y: 0 - deep }, { x: half, y: 0 }, { x: 0 - half, y: 0 }])
  }
  return inElement(piece, flatOutline(piece.shape, piece.size, pieces))
}

/** What one piece leaves open seen from above, where the piece stands inside its element. */
export function pieceHoles(piece: Piece, pieces = CORNER_PIECES): Array<Array<{ x: number; y: number }>> {
  if (piece.faces === 'front') return []
  return holesOf(piece.shape, pieces).map(hole => inElement(piece, hole))
}

/** The outline round all the pieces of a thing, with no dents: the ground the thing takes up. */
function roundPieces(shape: Pieces, pieces = CORNER_PIECES) {
  return footprint(shape.pieces.flatMap(piece => pieceOutline(piece, pieces).map(p => ({ ...p, z: 0 }))))
}

/** The outline round all that a thing is laid from, with no dents: the ground the thing takes up. Worked out
 * once for each such thing: it may be laid from thousands. */
const laidRound = new WeakMap<Laid, Array<{ x: number; y: number }>>()
function roundLaid(shape: Laid) {
  let round = laidRound.get(shape)
  if (!round) {
    // each element's own outline once, then moved to every place that element lies on
    const own = new Map<WorldElement, Array<{ x: number; y: number }>>()
    const ownOutline = (e: WorldElement) => {
      let points = own.get(e)
      if (!points) { points = outline(e); own.set(e, points) }
      return points
    }
    // a bent thing takes up the ground round its bent strip, seen from above (bend.ts)
    round = shape.bend ? footprint(bentWalk(shape.bend))
      // a strip of another shape (wave.ts): the ground round every corner of its tiles, seen from above
      : shape.frame ? footprint(shape.things.filter(t => !t.under && t.element === BASE_TILE).flatMap(t => [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([i, j]) => shape.frame!(t.at.x + (i * BASE_TILE.size.x) / 2, t.at.y + (j * BASE_TILE.size.y) / 2).at)))
      : footprint(shape.things.flatMap(t => ownOutline(t.element).map(p => ({ x: t.at.x + p.x, y: t.at.y + p.y, z: 0 }))))
    laidRound.set(shape, round)
  }
  return round
}

/** A quarter of a circle as points: round `middle`, `r` metres out, from the angle `from` a quarter turn on,
 * against the clock (`turn` 1) or with it (`turn` -1). The last point is left out when `open`. */
function quarter(middle: { x: number; y: number }, r: number, from: number, turn: 1 | -1, pieces: number, open: boolean) {
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= pieces - (open ? 1 : 0); i++) {
    const a = from + turn * (i / pieces) * (Math.PI / 2)
    points.push({ x: middle.x + r * Math.cos(a), y: middle.y + r * Math.sin(a) })
  }
  return points
}

/** A slab from above, from the corner at high x and low y. Each rounded corner is a quarter circle of the
 * slab's radius, so the straight part of each side is shorter than the side by twice the radius. */
function slabOutline(size: Size, slab: Slab, pieces: number) {
  const [hx, hy] = [size.x / 2, size.y / 2]
  const r = Math.min(slab.cornerRadius, hx, hy)
  if (r === 0) return [{ x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }, { x: -hx, y: -hy }]
  return [
    ...quarter({ x: hx - r, y: -hy + r }, r, -Math.PI / 2, 1, pieces, false),
    ...quarter({ x: hx - r, y: hy - r }, r, 0, 1, pieces, false),
    ...quarter({ x: -hx + r, y: hy - r }, r, Math.PI / 2, 1, pieces, false),
    ...quarter({ x: -hx + r, y: -hy + r }, r, Math.PI, 1, pieces, false),
  ]
}

/** An astroid from above, from its point at high x. Each side is the rounded corner of the slab that lies
 * beyond it: a quarter circle whose middle is `radius` out along both x and y, bending in toward 0, 0. */
function astroidOutline(astroid: Astroid, pieces: number) {
  const r = astroid.radius
  return [
    ...quarter({ x: r, y: r }, r, -Math.PI / 2, -1, pieces, true), // from x r, y 0 to x 0, y r
    ...quarter({ x: -r, y: r }, r, 0, -1, pieces, true), // on to x -r, y 0
    ...quarter({ x: -r, y: -r }, r, Math.PI / 2, -1, pieces, true), // on to x 0, y -r
    ...quarter({ x: r, y: -r }, r, Math.PI, -1, pieces, true), // and back to x r, y 0
  ]
}

/** Where the eye stands to see the whole of an element, and what it looks at: a pick of mine, so that the
 * gallery's picture and the first sight in the 3D view are the same for every element. It stands toward low y
 * and a little toward low x, above, far enough for the element's farthest corner to be in sight. */
export function firstSight(e: WorldElement, widestAngle = 50): { from: { x: number; y: number; z: number }; at: { x: number; y: number; z: number } } {
  const at = { x: 0, y: 0, z: e.size.z / 2 }
  const reach = Math.hypot(e.size.x, e.size.y, e.size.z) / 2
  const far = (reach / Math.sin((widestAngle / 2) * (Math.PI / 180))) * 1.15
  // (till 22 Nov 2026: x 0.42. The user had x turned round, place.ts; the eye stays where it was.)
  const toward = { x: -0.42, y: -0.72, z: 0.55 }
  const long = Math.hypot(toward.x, toward.y, toward.z)
  const round = (n: number) => Math.round(n * 10) / 10
  return {
    from: { x: round(at.x + (toward.x / long) * far), y: round(at.y + (toward.y / long) * far), z: round(at.z + (toward.z / long) * far) },
    at,
  }
}
