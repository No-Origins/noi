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
// ON THE GRID, IN STEPS (23 Nov 2026, issue 131). The user decided how elements are sized: "the stage might need
// individual steps with width, height, and length", and part sizes are not registered ("there is no point in saving
// individual part sizes"). So Eidos holds the stage's steps (noi.eio.world.stage): its width and breadth in whole
// tiles, 1 to 10 (one record for both: MY PICK), and the heights of its base, 2, 4, 6, 8 and 10 m. Every other
// number is this element's own, named below. Every colour is Eidos's; its states, its settings and its colour are
// keys Mero holds for it. Its outline, corners and border are the base tile's, read
// from BASE_TILE; the glass's white is the pool wall's (noi.eio.color.world.wall).
import type { StageColour, StageSetting, StageState } from '@noi/eio-tokens/components'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role, steps } from '../drawing/eidos.ts'
import type { ElementColour, ElementState, Piece, Pieces, Surface, WorldElement } from '../drawing/element.ts'
import type { Size } from '../drawing/space.ts'

/** The heights the base may have (Eidos's steps), and the widths and breadths, in whole tiles. */
const BASE_HEIGHTS = steps('noi.eio.world.stage.base-height')
const TILES = steps('noi.eio.world.stage.width-and-breadth')
/** The stage as it is made, on its first base: how tall the base is (the first of its heights), how far above it
 * the glass floats (the user's 1 m), how thick the glass is. */
const MADE = {
  tall: BASE_HEIGHTS[0]?.value ?? 0,
  gap: 1,
  glass: 0.05,
} as const
/** How much of the base's growth each of these takes: 1 grows as the base does, 0 not at all. */
const GROWS = {
  glass: 1,
  border: 0.5,
  gap: 0.1,
} as const
const POST = { across: 0.4 } as const
/** How much the block and its posts shine: glossy (the user's "Shine: Glossy"). */
const SHINE = 1
/** How bright its lit parts are in the active state: the borders fully, the top and the sides half as brightly
 * (the user's "Top face: Half. Border: Full. Sides: Half."). */
const BRIGHT = { full: 1, half: 0.5 } as const
/** The glass: it hides nothing behind it, and is heavily frosted (the user's "Frost: Heavy. Hides: Nothing."). */
const GLASS: Surface = { colour: role('noi.eio.color.world.wall'), finish: 'frosted', hides: 0, frost: 0.85, says: 'heavily frosted glass' }

/** The sizes one may choose, in metres: the width and breadth in whole tiles, each said in metres (the user: "Sizes
 * are steps of 10m."); the base's heights as Eidos holds them (the user's own numbers: "starting with 2, then 4,
 * then 8, and then 10"; and 6, 23 Nov 2026, piece 51, after laying stages 6 m tall: "Yeah, let's do it."). */
const inMetres = (metres: number) => ({ name: `${metres} m`, value: metres })
const ACROSS = TILES.map(step => step.value * BASE_TILE.size.x)

/** THE STAGE'S SETTINGS, each by the key Mero holds for it: what it is called, which way it sizes the stage, and
 * the steps one may choose among. They are offered in one group, Size. */
export const STAGE_SETTINGS: Record<StageSetting, { readonly name: string; readonly along: 'x' | 'y' | 'z'; readonly steps: readonly number[] }> = {
  width: { name: 'Width', along: 'x', steps: ACROSS },
  breadth: { name: 'Breadth', along: 'y', steps: ACROSS },
  height: { name: 'Height of the base', along: 'z', steps: BASE_HEIGHTS.map(step => step.value) },
}

/** THE STAGE'S COLOUR, by the key Mero holds for it: the one colour all its lit parts give off, lime to begin
 * with. Its name, Colour, is the user's own word. */
export const STAGE_COLOURS: Record<StageColour, Omit<ElementColour, 'id'>> = {
  light: { name: 'Colour', colour: role('noi.eio.color.action.primary') },
}
const ONE: StageColour = 'light'

/** THE STAGE'S STATES, each by the key Mero holds for it. In the active state the block's border glows fully, its
 * top and its sides (and the posts, which are of the sides) half as brightly, and the glass's border fully: each
 * in the stage's one colour. */
export const STAGE_STATES: Record<StageState, Omit<ElementState, 'id'>> = {
  default: { name: 'Default', says: 'It stands dark, in the base tile\'s style.' },
  active: {
    name: 'Active',
    says: 'The whole block glows, its border fully and its top and its sides half as brightly, and so does the border of the glass.',
    glow: {
      colour: role('noi.eio.color.action.primary'),
      borders: [
        { piece: 'block', colour: ONE, bright: BRIGHT.full, sidesBright: BRIGHT.half },
        { piece: 'glass', colour: ONE, bright: BRIGHT.full },
        // the posts light as the block's sides do
        ...[1, 2, 3, 4].map(n => ({ piece: `post ${n}`, colour: ONE, bright: BRIGHT.half, sidesBright: BRIGHT.half })),
      ],
      tops: [{ piece: 'block', colour: ONE, bright: BRIGHT.half }],
    },
  },
}

/** The stage in a size: so wide along x, so long along y, its base so tall. */
function stageOf(to: Size): WorldElement & { readonly shape: Pieces } {
  const flat = { x: to.x, y: to.y }
  // how many times as tall the base is as the one the stage is made with. A number of that stage, grown for
  // this base: by all of the base's growth (`share` 1), by none of it (0), or by a part of it; to the millimetre
  const taller = to.z / MADE.tall
  const grown = (metres: number, share: number) => Math.round(metres * (1 + share * (taller - 1)) * 1000) / 1000
  const border = { ...BASE_TILE.border, width: grown(BASE_TILE.border.width, GROWS.border) }
  const [gap, glass] = [grown(MADE.gap, GROWS.gap), grown(MADE.glass, GROWS.glass)]
  return {
    id: 'stage',
    name: 'Stage',
    says: 'A block in the style of a base tile, with its outline and its border, glossy, and a sheet of heavily frosted glass with the same outline floating above it.',
    size: { ...flat, z: to.z + gap + glass },
    shape: {
      kind: 'pieces',
      pieces: [
        { name: 'block', shape: BASE_TILE.shape, size: { ...flat, z: to.z }, at: { x: 0, y: 0 }, border },
        { name: 'glass', shape: BASE_TILE.shape, size: { ...flat, z: glass }, at: { x: 0, y: 0 }, up: to.z + gap, surface: GLASS, border: { width: border.width, colour: GLASS.colour, surface: GLASS } },
        ...([[1, 1], [-1, 1], [-1, -1], [1, -1]] as const).map(([sx, sy], n): Piece => ({
          name: `post ${n + 1}`,
          shape: { kind: 'slab', cornerRadius: POST.across / 2 },
          size: { x: POST.across, y: POST.across, z: gap },
          // the corner's radius in from each of the two sides, so on the corner's own diagonal
          at: { x: sx * (to.x / 2 - BASE_TILE.shape.cornerRadius), y: sy * (to.y / 2 - BASE_TILE.shape.cornerRadius) },
          up: to.z,
          // the material and colour of the block's sides (its border's walls): the same surface
          surface: { colour: BASE_TILE.border.colour, finish: 'matte', shine: SHINE, says: 'glossy, as the block\'s sides' },
        })),
      ],
      says: `a block with the base tile's corners and a border ${border.width} m wide, a thin sheet of glass with the same outline floating ${gap} m above it, and a round post at each corner joining the two`,
    },
    // the tile's own colour and finish (a change to the tile's style changes the block), made to shine
    surface: { ...BASE_TILE.surface, shine: SHINE, says: 'glossy black, under heavily frosted glass' },
    states: Object.entries(STAGE_STATES).map(([id, state]) => ({ id, ...state })),
    colours: Object.entries(STAGE_COLOURS).map(([id, colour]) => ({ id, ...colour })),
    settings: Object.entries(STAGE_SETTINGS).map(([id, s]) => ({ id, group: 'Size', name: s.name, sets: { what: 'size', along: s.along }, steps: s.steps.map(inMetres), value: to[s.along] })),
    sized: stageOf,
  }
}

/** The stage: a glossy block in the base tile's style, as wide as one tile, and a sheet of heavily frosted
 * glass floating above it. */
export const STAGE: WorldElement & { readonly shape: Pieces } = stageOf({ x: BASE_TILE.size.x, y: BASE_TILE.size.y, z: MADE.tall })
