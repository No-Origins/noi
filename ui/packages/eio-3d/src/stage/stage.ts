// THE STAGE, for now only its states. The first world's stage (a small black stage that showed one element of
// that world at a time) was taken out with the rest of the first world on 23 Nov 2026. The user gave its name to
// the new world's stage: a glossy block in the base tile's style with a sheet of heavily frosted glass floating
// above it (the Explorer's app/hyperbase/world/elements.ts, STAGE). Its drawing comes into this folder with the
// new world's elements, which change this meron in place; until then this file holds the stage's two states,
// in the new world's own words, so that the name stays a component Mero holds.
import type { StageState } from '@noi/eio-tokens/components'

/** Each state of the stage, as the new world says it. */
export const STAGE_STATES: Record<StageState, string> = {
  default: 'It stands dark, in the base tile\'s style.',
  active: 'The whole block glows, its border fully and its top and its sides half as brightly, and so does the border of the glass.',
}

/** The stage in a state, in words. */
export function stageWords(state: StageState): string {
  return STAGE_STATES[state]
}
