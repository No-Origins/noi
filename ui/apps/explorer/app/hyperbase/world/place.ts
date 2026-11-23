// A PLACE ON THE LAND, as the user decided it on 21 Nov 2026 (issue 117 in noi-planning). A place is two plain
// numbers, x and y, as on a map; one step is one metre; height is a third
// number, z, pointing up, and left out the thing stands on the ground. A place is written "x 10, y 15", and
// "x 10, y 15, z 3" off the ground. Whatever reads a place also takes bare "10, 15" (x first) and "minus" in any
// spelling, and answers in the written form. A thing stands on its place by the middle of its base; a long thing
// is said by its two ends.
//
// WHERE THE NUMBERS START AND WHICH WAY THEY GROW, CHANGED BY THE USER ON 22 Nov 2026 (issue 127). It was: 0, 0
// in the middle of the land. Then the land got an isometric view in which the way from the beginning to the end
// runs down the picture, and the user: "Now that we have updated beginning and end, I also think we should
// update the axis and numbers." Shown a drawing of two ways and asked which, they chose "Both":
//   y counts from the beginning: y 0 is the beginning's side, and y grows toward the end;
//   x is turned round, so that it grows toward the right of the picture (the left side on the left).
// x 0 is still the line down the middle of the land, from the beginning to the end. So x 0, y 0 is the middle
// of the beginning's side. (How far the land runs is the land's own data: land.ts.)
//
// Nothing here knows three.js, except the two functions that are the ONLY crossing between the user's x, y, z
// and three.js's own order: toThree and fromThree.

/** A place, in the user's own numbers: metres from the middle of the land, and metres up. */
export interface Place {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A place from its numbers. Height left out: on the ground. */
export function at(x: number, y: number, z = 0): Place {
  return { x, y, z }
}

/** THE ONE CROSSING, there: the user's x runs along three.js's -x (turned round at the user's word of 22 Nov
 * 2026; till then it stayed x), their y runs along three.js's -z, their z (up) is three.js's y. Nothing is
 * scaled: one metre is one of three.js's units. With x turned round, the user's x, y and z are as a page's are
 * with height added: x to the right, y down the page, z toward the reader. three.js's own are the other way
 * round, so what is drawn in the user's x, y, z is drawn in three.js as in a mirror; three.js draws that
 * rightly by itself. */
export function toThree(p: Place): [number, number, number] {
  return [0 - p.x, p.z, 0 - p.y]
}

/** THE ONE CROSSING, back: a point in three.js as the user says it. */
export function fromThree(tx: number, ty: number, tz: number): Place {
  return { x: 0 - tx, y: 0 - tz, z: ty }
}

/** MY PICK, not the user's word: a place is written to the millimetre at the finest, so that what is said back
 * is the number that was given and not a rounder one. */
export const FINEST = 3

/** A number as a place writes it: no more decimals than asked, no trailing zeros, and never "-0". */
export function written(n: number, decimals = FINEST): string {
  const k = 10 ** decimals
  const r = Math.round(n * k) / k
  return String(r === 0 ? 0 : r)
}

/** A place as it is written (the user: "x 10, y 15", and "x 10, y 15, z 3" off the ground). */
export function writePlace(p: Place, decimals = FINEST): string {
  const z = written(p.z, decimals)
  return `x ${written(p.x, decimals)}, y ${written(p.y, decimals)}` + (z === '0' ? '' : `, z ${z}`)
}

// Every dash a keyboard or a dictation can put where a minus was said: hyphen-minus, the hyphens, the figure,
// en and em dashes, the bar, the real minus sign, and the small and the wide hyphen-minus. Written by their
// numbers so that no two of them can be mistaken for each other in this file.
const DASHES = [0x2d, 0x2010, 0x2011, 0x2012, 0x2013, 0x2014, 0x2015, 0x2212, 0xfe63, 0xff0d].map(c => String.fromCodePoint(c))
const MINUS_WORDS = /(?<![a-z])(?:minus|negative|neg)(?![a-z])/g
const PLUS_WORDS = /(?<![a-z])plus(?![a-z])/g
// A number, with the letter of its axis before it or bare, and its sign.
const NUMBER = /(?:([xyz])\s*[:=]?\s*)?([-+]\s*)?(\d+(?:\.\d+)?|\.\d+)(?!\d|\.\d)/g
// What may stand between the numbers and after them, and nothing else may.
const BETWEEN = /(?<![a-z])(?:and|m|metres?|meters?)(?![a-z])/g

/** Reads a place: the written form in any order ("y 15, x 10"), bare numbers with x first ("10, 15" and
 * "10, 15, 3"), and "minus" in any spelling ("-10", "minus 10", a dash of any length). Returns null when the
 * words are not one place, rather than guess: one number, an axis said twice, letters on some numbers only. */
export function readPlace(text: string): Place | null {
  let t = text.toLowerCase()
  for (const dash of DASHES) t = t.split(dash).join('-')
  t = t.replace(MINUS_WORDS, '-').replace(PLUS_WORDS, '+')
  const found: Array<{ axis: 'x' | 'y' | 'z' | null; n: number }> = []
  const rest = t.replace(NUMBER, (_all, axis: string | undefined, sign: string | undefined, digits: string) => {
    const n = Number(digits) * (sign?.trim() === '-' ? -1 : 1)
    found.push({ axis: (axis as 'x' | 'y' | 'z' | undefined) ?? null, n: n === 0 ? 0 : n })
    return ' '
  })
  if (/[^\s,;().]/.test(rest.replace(BETWEEN, ' '))) return null
  const lettered = found.filter(f => f.axis !== null)
  if (lettered.length === 0) {
    if (found.length !== 2 && found.length !== 3) return null
    return at(found[0]!.n, found[1]!.n, found[2]?.n ?? 0)
  }
  if (lettered.length !== found.length) return null
  const got: { x?: number; y?: number; z?: number } = {}
  for (const f of found) {
    if (f.axis === null || got[f.axis] !== undefined) return null
    got[f.axis] = f.n
  }
  if (got.x === undefined || got.y === undefined) return null
  return at(got.x, got.y, got.z ?? 0)
}

/** A long thing, said by its two ends. */
export interface Span {
  readonly from: Place
  readonly to: Place
}

/** A long thing as it is written (the user's form: "from x 0, y 10 to x 20, y 10"). */
export function writeSpan(s: Span, decimals = FINEST): string {
  return `from ${writePlace(s.from, decimals)} to ${writePlace(s.to, decimals)}`
}

/** Reads a long thing by its two ends; "from" may be left out. Null when either end is not a place. */
export function readSpan(text: string): Span | null {
  const m = /^\s*(?:from\s+)?(.+?)\s+to\s+(.+?)\s*$/i.exec(text)
  if (!m) return null
  const from = readPlace(m[1]!)
  const to = readPlace(m[2]!)
  return from && to ? { from, to } : null
}

/** How far it is from one place to another, in metres. */
export function between(a: Place, b: Place): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
}

/** A thing's size in metres: how far it runs along x, along y, and up. */
export interface Size {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** Where a thing of this size is when it stands on a place: THE MIDDLE OF ITS BASE is on the place (the user:
 * "A, middle of base"), so it spreads evenly along x and y and rises from there. `low` and `high` are its two
 * opposite corners, `middle` its very middle. */
export function standsOn(place: Place, size: Size): { low: Place; high: Place; middle: Place } {
  return {
    low: at(place.x - size.x / 2, place.y - size.y / 2, place.z),
    high: at(place.x + size.x / 2, place.y + size.y / 2, place.z + size.z),
    middle: at(place.x, place.y, place.z + size.z / 2),
  }
}
