// READING EIDOS (23 Nov 2026). The few numbers of the 3D world that Eidos holds, and every colour, come from Eidos:
// the numbers as Mero wrote them into @noi/eio-tokens, the colours as the page's style has them. Since 23 Nov
// Eidos holds only what fits elements together or is the world's own decision (the tile, the stud, the states'
// change), an element's registered size, and its steps: one record of named steps for a scale or a size one may
// choose. An element's other numbers are its own, named in its own folder (rule 2 of the package's rules test).
// A value is named by its full path in Eidos, written out where it is read, and each colour by its role's path:
// so Mero's script (noi/scripts/eio-components.mjs) sees which values each file reads, and the type check refuses
// a path Eidos does not have. This file names no path of its own: a path written out here would count as read by
// the shared drawing itself.
import { tokens } from '@noi/eio-tokens'

/** Every "group.name" of a tree of two levels. */
type Paths<T> = { [G in keyof T & string]: { [N in keyof T[G] & string]: `${G}.${N}` }[keyof T[G] & string] }[keyof T & string]
/** Every "group.name" of a tree of two levels whose value is of the kind `V`. */
type PathsTo<T, V> = { [G in keyof T & string]: { [N in keyof T[G] & string]: T[G][N] extends V ? `${G}.${N}` : never }[keyof T[G] & string] }[keyof T & string]

// Where the paths of the world's numbers and of the colours begin, written so that neither is a path itself.
const NUMBERS = `noi${'.'}eio.world.` as const
const COLOURS = `noi${'.'}eio.color.` as const

/** A number of the 3D world, by its path in Eidos. */
export type NumberPath = `${typeof NUMBERS}${PathsTo<typeof tokens.world, number>}`
/** A set of steps of the 3D world, by its path in Eidos. */
export type StepsPath = `${typeof NUMBERS}${PathsTo<typeof tokens.world, readonly unknown[]>}`
/** A colour role of Eidos, by its path. A palette colour is never read: only a role, by its meaning. */
export type RolePath = `${typeof COLOURS}${Paths<Omit<typeof tokens.color, 'palette'>>}`

/** One step as Mero writes it: its name, and its number under its unit's field (a share, metres, a count). */
type WrittenStep = { readonly name: string; readonly share?: number; readonly m?: number; readonly count?: number }
const world: Readonly<Record<string, Readonly<Record<string, number | readonly WrittenStep[]>>>> = tokens.world

/** What Eidos holds at a path of the world: a number or a set of steps. */
function at(path: string): number | readonly WrittenStep[] | undefined {
  const [group, name] = path.slice(NUMBERS.length).split('.')
  return world[group ?? '']?.[name ?? '']
}

/** The number Eidos holds at this path, in its kind's unit: metres, seconds, degrees, a share or a count. */
export function value(path: NumberPath): number {
  const n = at(path)
  if (typeof n !== 'number') throw new Error(`Eidos has no number ${path}.`)
  return n
}

/** One step of a set: its name in words and its number, in the set's unit (a share, metres or a count). */
export interface Step {
  readonly name: string
  readonly value: number
}

/** The steps Eidos holds at this path, in their order, from the least to the most. */
export function steps(path: StepsPath): readonly Step[] {
  const list = at(path)
  if (!Array.isArray(list)) throw new Error(`Eidos has no steps ${path}.`)
  return list.map((step: WrittenStep) => ({ name: step.name, value: step.share ?? step.m ?? step.count ?? Number.NaN }))
}

/** A colour role of Eidos as the page's style names it: the variable the page gives its colour by. The page
 * says what that colour is (an element is drawn with a `colourOf` that reads it). */
export function role(path: RolePath): string {
  return `--eio-color-${path.slice(COLOURS.length).replace('.', '-')}`
}
