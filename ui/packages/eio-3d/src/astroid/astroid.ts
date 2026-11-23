// THE ASTROID (21 Nov 2026, issue 123 in noi-planning). THE USER'S WORDS: "when 4 of these tiles put together as 2
// rows and 2 columns, the center forms a shape called [astroid]. So I want the [astroid] element, and it should be
// the secondary color". So the astroid is worked out FROM the base tile, never written beside it: its four curved
// sides are the four tiles' rounded corners, and it is as thick as they are. It has no number of its own. Its
// colour is Eidos's secondary colour. MY PICK, not the user's word: that it is matte like the tile.
import type { AstroidMeasure } from '@noi/eio-tokens/components'
import { BASE_TILE } from '../base-tile/base-tile.ts'
import { role } from '../drawing/eidos.ts'
import type { Astroid, WorldElement } from '../drawing/element.ts'

/** Each measure of the astroid, in metres: the base tile's, by the key Mero holds for it. */
export const ASTROID_MEASURES: Record<AstroidMeasure, number> = {
  radius: BASE_TILE.shape.cornerRadius,
  thickness: BASE_TILE.size.z,
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
}
