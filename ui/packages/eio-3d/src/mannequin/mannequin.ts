// THE MANNEQUIN (17 Nov 2026), AN ELEMENT OF THE WORLD (23 Nov 2026). A character of the old No Origins project,
// made with Meshy.ai, brought in at the user's word: "we should bring in Mannequin and Fairyboat too". On 23 Nov:
// "bring in the characters into elements". So it is an element like the others, in the gallery, drawn by the
// world's three.js from its files (assets/characters/mannequin: its model and its look), as tall as a character is,
// standing on its place by the middle of its base and facing the front (low y).
// FROM THE USER'S WORDS (17 Nov): standing is "just standing", legs straight, arms down, no resting idle; it walks
// and runs with the clips its model carries. MY DESIGN, not the user's word: that these three are its states, that
// it walks and runs on the spot, and the sentences.
import type { MannequinState } from '@noi/eio-tokens/components'
import { CHARACTER_SIZE, CHARACTER_SURFACE, character } from '../character-drawing/characters.ts'
import type { ElementState, Model, WorldElement } from '../drawing/element.ts'

/** THE MANNEQUIN'S STATES, each by the key Mero holds for it, and what it does in it. */
export const MANNEQUIN_STATES: Record<MannequinState, Omit<ElementState, 'id'>> = {
  standing: { name: 'Standing', says: 'It stands plainly on its place: legs straight, arms down at its sides.', motion: 'stand' },
  walking: { name: 'Walking', says: 'It walks on the spot, with the walk its model carries.', motion: 'walk' },
  running: { name: 'Running', says: 'It runs on the spot, with the run its model carries.', motion: 'run' },
}

/** The Mannequin, a person of the old No Origins project. */
export const MANNEQUIN: WorldElement & { readonly shape: Model } = {
  id: 'mannequin',
  name: 'Mannequin',
  says: 'A person of the old No Origins project, made with Meshy.ai, as tall as a character is: it stands, walks or runs on its place.',
  size: CHARACTER_SIZE,
  shape: {
    kind: 'model',
    drawn: character({ model: 'mannequin/mannequin.glb', look: 'mannequin/mannequin.jpg' }),
    says: 'its model, with its bones, its walk and its run, and its look, one picture over the whole of it',
  },
  surface: CHARACTER_SURFACE,
  states: Object.entries(MANNEQUIN_STATES).map(([id, state]) => ({ id, ...state })),
}
