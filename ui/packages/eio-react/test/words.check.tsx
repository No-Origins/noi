// Rule 1 of Eidos Form Controls (agreed 8 Nov), checked by the type checker: every checkbox and radio
// has its words. `pnpm typecheck` fails if a Checkbox or Radio without words ever compiles.
import { Checkbox, Radio } from '../src'

export const withWords = (
  <>
    <Checkbox>They hold Owner</Checkbox>
    <Radio name="effect">Forbids</Radio>
  </>
)

// @ts-expect-error: a checkbox needs its words.
export const checkboxAlone = <Checkbox />
// @ts-expect-error: a radio needs its words.
export const radioAlone = <Radio name="effect" />
