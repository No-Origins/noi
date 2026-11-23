// THE ASTROID (21 Nov 2026, issue 123 in noi-planning). THE USER'S WORDS: "when 4 of these tiles put together as 2
// rows and 2 columns, the center forms a shape called [astroid]. So I want the [astroid] element, and it should be
// the secondary color". So the astroid is worked out FROM the base tile, never written beside it: its four curved
// sides are the four tiles' rounded corners, and it is as thick as they are. It has no number of its own. Its
// colour is Eidos's secondary colour. MY PICK, not the user's word: that it is matte like the tile.
//
// IT HAS TWO STATES (23 Nov 2026). In the intro that opens the world the astroids glow as the platform is built; the
// user: "the asteroids between the tiles should glow when they render, and they have to keep glowing till the
// camera reaches the end, and then they should go back to their normal state", and then: "Since we added glow
// animation for the asteroids, it should be a state, right?" So: Default, as it always was; and Active, in which it
// glows. Named as the stage's two states are. The user saw the glow in the intro and said "Glow is right"; how it
// glows was a session's pick till then, and each number of it is Eidos's (noi.eio.world.astroid).
import type { AstroidMeasure, AstroidState } from '@noi/eio-tokens/components'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role, value } from '../drawing/eidos.ts'
import type { Astroid, ElementState, WorldElement } from '../drawing/element.ts'

/** Each measure of the astroid, in metres: the base tile's, by the key Mero holds for it. */
export const ASTROID_MEASURES: Record<AstroidMeasure, number> = {
  radius: BASE_TILE.shape.cornerRadius,
  thickness: BASE_TILE.size.z,
}

/** The astroid's states, by the key Mero holds for each. Active: it gives off its own colour, brighter than the
 * colour itself, and a soft light of that colour lies on the tiles round it, nearly as far as the next astroid's. */
export const ASTROID_STATES: Record<AstroidState, Omit<ElementState, 'id'>> = {
  default: { name: 'Default', says: 'It lies matte, in the secondary colour.' },
  active: {
    name: 'Active',
    says: 'It glows in its own colour, and a soft light of that colour lies on the tiles round it.',
    glow: {
      colour: role('noi.eio.color.action.secondary'),
      borders: [],
      whole: {
        bright: value('noi.eio.world.astroid.active-bright'),
        round: {
          across: value('noi.eio.world.astroid.active-light-across'),
          above: value('noi.eio.world.astroid.active-light-above'),
          bright: value('noi.eio.world.astroid.active-light-bright'),
        },
      },
    },
  },
}

/** The astroid: the shape left open where four base tiles meet, two rows by two columns. Everything about its
 * shape comes from the base tile, so a change to the tile's corners or thickness changes it too. */
export const ASTROID: WorldElement & { readonly shape: Astroid } = {
  id: 'astroid',
  name: 'Astroid',
  says: 'It fills the middle where four base tiles meet, two rows by two columns.',
  size: { x: 2 * ASTROID_MEASURES.radius, y: 2 * ASTROID_MEASURES.radius, z: ASTROID_MEASURES.thickness },
  shape: { kind: 'astroid', radius: ASTROID_MEASURES.radius },
  surface: { colour: role('noi.eio.color.action.secondary'), finish: 'matte', says: 'matte, in the secondary colour' },
  states: Object.entries(ASTROID_STATES).map(([id, state]) => ({ id, ...state })),
}
