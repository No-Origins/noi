// CLAY (17 Nov 2026), AN ELEMENT OF THE WORLD (23 Nov 2026). A character of the old No Origins project, made with
// Meshy.ai, brought in at the user's word on 17 Nov, the character chosen for now. On 23 Nov: "bring in the
// characters into elements". So he is an element like the others, in the gallery, drawn by the world's three.js
// from his files (assets/characters/clay: his model and his look), as tall as a character is, standing on his place
// by the middle of his base and facing the front (low y).
// FROM THE USER'S WORDS (17 Nov): standing is no resting idle with a bent leg but "just standing", legs straight,
// arms down; he walks and runs with the clips his model carries. MY DESIGN, not the user's word: that these three
// are his states, that he walks and runs on the spot, and the sentences.
import type { ClayState } from '@noi/eio-tokens/components'
import { CHARACTER_SIZE, CHARACTER_SURFACE, character } from '../character-drawing/characters.ts'
import type { ElementState, Model, WorldElement } from '../drawing/element.ts'

/** CLAY'S STATES, each by the key Mero holds for him, and what he does in it. */
export const CLAY_STATES: Record<ClayState, Omit<ElementState, 'id'>> = {
  standing: { name: 'Standing', says: 'He stands plainly on his place: legs straight, arms down at his sides.', motion: 'stand' },
  walking: { name: 'Walking', says: 'He walks on the spot, with the walk his model carries.', motion: 'walk' },
  running: { name: 'Running', says: 'He runs on the spot, with the run his model carries.', motion: 'run' },
}

/** Clay, a person of the old No Origins project. */
export const CLAY: WorldElement & { readonly shape: Model } = {
  id: 'clay',
  name: 'Clay',
  called: 'Clay',
  says: 'A person of the old No Origins project, made with Meshy.ai, as tall as a character is: he stands, walks or runs on his place.',
  size: CHARACTER_SIZE,
  shape: {
    kind: 'model',
    drawn: character({ model: 'clay/clay.glb', look: 'clay/clay.jpg' }),
    says: 'his model, with its bones, its walk and its run, and his look, one picture over the whole of him',
  },
  surface: CHARACTER_SURFACE,
  states: Object.entries(CLAY_STATES).map(([id, state]) => ({ id, ...state })),
}
