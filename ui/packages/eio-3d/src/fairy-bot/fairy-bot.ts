// THE FAIRY BOT (17 Nov 2026), AN ELEMENT OF THE WORLD (23 Nov 2026). A character of the old No Origins project,
// made with Meshy.ai, brought in at the user's word: "we should bring in Mannequin and Fairyboat too". On 23 Nov:
// "bring in the characters into elements". So it is an element like the others, in the gallery, drawn by the
// world's three.js from its files (assets/characters/fairy-bot: its model, its look and its wings), as tall as a
// character is, standing on its place by the middle of its base and facing the front (low y).
// FROM THE USER'S WORDS (17 Nov): standing is "just standing", legs straight, arms down, no resting idle; it walks
// and runs with the clips its model carries. ITS WINGS hang where the old project hung them, the user's tuning there
// (its FAIRY_WINGS), and flutter while it moves as they did there; every number of them is Eidos's
// (noi.eio.world.fairy-bot). MY DESIGN, not the user's word: that these three are its states, that it walks and
// runs on the spot, and the sentences.
import type { FairyBotState } from '@noi/eio-tokens/components'
import { CHARACTER_SIZE, CHARACTER_SURFACE, character } from '../character-drawing/characters.ts'
import { value } from '../drawing/eidos.ts'
import type { ElementState, Model, WorldElement } from '../drawing/element.ts'

/** THE FAIRY BOT'S STATES, each by the key Mero holds for it, and what it does in it. */
export const FAIRY_BOT_STATES: Record<FairyBotState, Omit<ElementState, 'id'>> = {
  standing: { name: 'Standing', says: 'It stands plainly on its place: legs straight, arms down at its sides, its wings at rest.', motion: 'stand' },
  walking: { name: 'Walking', says: 'It walks on the spot, with the walk its model carries, its wings fluttering.', motion: 'walk' },
  running: { name: 'Running', says: 'It runs on the spot, with the run its model carries, its wings fluttering.', motion: 'run' },
}

/** The Fairy Bot, a person of the old No Origins project with wings on its upper back. */
export const FAIRY_BOT: WorldElement & { readonly shape: Model } = {
  id: 'fairy-bot',
  name: 'Fairy Bot',
  says: 'A person of the old No Origins project with wings on its upper back, made with Meshy.ai, as tall as a character is: it stands, walks or runs on its place.',
  size: CHARACTER_SIZE,
  shape: {
    kind: 'model',
    drawn: character({
      model: 'fairy-bot/fairy-bot.glb',
      look: 'fairy-bot/fairy-bot.jpg',
      wings: {
        file: 'fairy-bot/wings.glb',
        span: value('noi.eio.world.fairy-bot.wing-span'),
        height: value('noi.eio.world.fairy-bot.wing-height'),
        back: value('noi.eio.world.fairy-bot.wing-back'),
        lean: value('noi.eio.world.fairy-bot.wing-lean'),
        flap: value('noi.eio.world.fairy-bot.wing-flap'),
        flapEvery: value('noi.eio.world.fairy-bot.wing-flap-every'),
      },
    }),
    says: 'its model, with its bones, its walk and its run, its look, one picture over the whole of it, and its wings, which flutter while it moves',
  },
  surface: CHARACTER_SURFACE,
  states: Object.entries(FAIRY_BOT_STATES).map(([id, state]) => ({ id, ...state })),
}
