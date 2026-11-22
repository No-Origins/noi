// Rule 1 of Eidos Form Controls (agreed 8 Nov), checked by the type checker: every checkbox, radio and
// toggle has its words. `pnpm typecheck` fails if a Checkbox, Radio or Toggle without words ever compiles.
import { Checkbox, Radio, Toggle } from '../src'

export const withWords = (
  <>
    <Checkbox>They hold Owner</Checkbox>
    <Radio name="effect">Forbids</Radio>
    <Toggle>Markers</Toggle>
  </>
)

// @ts-expect-error: a checkbox needs its words.
export const checkboxAlone = <Checkbox />
// @ts-expect-error: a radio needs its words.
export const radioAlone = <Radio name="effect" />
// @ts-expect-error: a toggle needs its words.
export const toggleAlone = <Toggle />
