// READING EIDOS (23 Nov 2026). Every number an element of the 3D world is drawn with, and every colour, comes
// from Eidos: the numbers as Mero wrote them into @noi/eio-tokens, the colours as the page's style has them.
// An element names each number by its full path in Eidos, written out where it is read, and each colour by its
// role's path: so Mero's script (noi/scripts/eio-components.mjs) sees which values each file reads, and the
// type check refuses a path Eidos does not have. This file names no path of its own: a path written out here
// would count as read by the shared drawing itself.
import { tokens } from '@noi/eio-tokens'

/** Every "group.name" of a tree of two levels. */
type Paths<T> = { [G in keyof T & string]: { [N in keyof T[G] & string]: `${G}.${N}` }[keyof T[G] & string] }[keyof T & string]

// Where the paths of the world's numbers and of the colours begin, written so that neither is a path itself.
const NUMBERS = `noi${'.'}eio.world.` as const
const COLOURS = `noi${'.'}eio.color.` as const

/** A number of the 3D world, by its path in Eidos. */
export type NumberPath = `${typeof NUMBERS}${Paths<typeof tokens.world>}`
/** A colour role of Eidos, by its path. A palette colour is never read: only a role, by its meaning. */
export type RolePath = `${typeof COLOURS}${Paths<Omit<typeof tokens.color, 'palette'>>}`

const numbers: Readonly<Record<string, Readonly<Record<string, number>>>> = tokens.world

/** The number Eidos holds at this path, in its kind's unit: metres, seconds, degrees, a share or a count. */
export function value(path: NumberPath): number {
  const [group, name] = path.slice(NUMBERS.length).split('.')
  const n = numbers[group ?? '']?.[name ?? '']
  if (n === undefined) throw new Error(`Eidos has no number ${path}.`)
  return n
}

/** A colour role of Eidos as the page's style names it: the variable the page gives its colour by. The page
 * says what that colour is (an element is drawn with a `colourOf` that reads it). */
export function role(path: RolePath): string {
  return `--eio-color-${path.slice(COLOURS.length).replace('.', '-')}`
}
