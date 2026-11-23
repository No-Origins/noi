// A STRIP OF SQUARE TILES LAID INTO A MÖBIUS LOOP (23 Nov 2026, issue 127, pieces 51 to 53).
// The user: "Now, what I want us to try is that to make the base platform of the world like a Mobius strip."
// Seeing a round loop whose tiles stretched: "I want the tiles to be always a square? I mean, without deforming
// the current base tile what we have, and then we can have the strip as long as needed." Seeing a 7 km loop of
// straight runs and bends: "the strip is too long and not as smooth as the previous version ... Most parts feel
// like a plane without any curve. So yeah, maybe think about it again."
//
// HOW A TILE STAYS SQUARE: the strip may bend only across its face, as a sheet of paper bends (never sideways in
// its own plane, which would stretch one edge and squeeze the other), and may twist about its own middle line
// only gently (a twist makes the edges a little longer than the middle: the tiles stay whole and a thin gap
// opens between them toward the edges). So the strip is given by two numbers at each metre along it: how fast it
// bends across its face, and how fast it twists. Each is a smooth wave round the loop: a few named numbers
// (`bending`, `twisting`). They were found by a search for a loop that closes on itself turned over (the Möbius
// strip's half turn), never comes within 240 m of itself, never bends tighter than 60 m, and twists no faster
// than a quarter turn in about 630 m. From those numbers the code works out the strip's whole shape, metre by
// metre.
//
// A thing is laid on the strip by its own x (across, from minus half the strip to half of it), y (along the
// strip, from 0 all the way round) and z (up from the strip). Each tile keeps its shape: it is put whole on its
// place, turned as the strip is turned there. Going once round, x is the other way round and up is down.
//
// MY PICKS, not the user's word: the length (2,400 m, the shortest the search closed with that gentle a twist
// and that much room); the twist's limit (gaps up to about 0.35 m at the outermost tiles, none in the middle);
// the search's other limits; that the loop starts lying flat, facing up.

/** How a flat strip is laid into a Möbius loop: its length, its width, and how it bends and twists along it.
 * `bending` and `twisting` are each a wave round the loop, in radians per kilometre: its mean, then, for one, two
 * and three waves round the loop, how much of the cosine and of the sine. */
export interface Bend {
  readonly kind: 'ribbon'
  /** How long the strip's middle line is, all the way round, in metres. */
  readonly long: number
  /** How wide the strip is (its x runs from minus half of this to half of it). */
  readonly across: number
  /** How thick what is laid on it is, both faces together. */
  readonly thick: number
  /** How fast it bends across its face, at each place along it. */
  readonly bending: readonly number[]
  /** How fast it twists about its middle line, at each place along it. */
  readonly twisting: readonly number[]
}

export interface Xyz { readonly x: number; readonly y: number; readonly z: number }

/** Where a place of the strip is, and which ways its own across, along and up point there. */
export interface Frame {
  readonly at: Xyz
  readonly across: Xyz
  readonly along: Xyz
  readonly up: Xyz
}

type V = [number, number, number]
const add = (a: Xyz, b: Xyz, k = 1): Xyz => ({ x: a.x + b.x * k, y: a.y + b.y * k, z: a.z + b.z * k })
const cross = (a: Xyz, b: Xyz): Xyz => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: Xyz): Xyz => { const l = Math.hypot(a.x, a.y, a.z); return { x: a.x / l, y: a.y / l, z: a.z / l } }
const xyz = (v: V): Xyz => ({ x: v[0], y: v[1], z: v[2] })

/** How long the strip is, all the way round (its middle line). */
export function lengthOf(bend: Bend): number {
  return bend.long
}

/** A wave round the loop at y, from its named numbers (per kilometre), per metre. */
function wave(numbers: readonly number[], long: number, y: number): number {
  let v = numbers[0] ?? 0
  for (let k = 1; 2 * k <= numbers.length - 1; k++) {
    const a = (2 * Math.PI * k * y) / long
    v += (numbers[2 * k - 1] ?? 0) * Math.cos(a) + (numbers[2 * k] ?? 0) * Math.sin(a)
  }
  return v / 1000
}

/** How fast the strip twists at y, in radians per metre. */
export function twistAt(bend: Bend, y: number): number {
  return wave(bend.twisting, bend.long, y)
}

/** How fast the strip bends across its face at y, in radians per metre. */
export function bendAt(bend: Bend, y: number): number {
  return wave(bend.bending, bend.long, y)
}

/** The strip's middle line, worked out metre by metre from how it bends and twists: where it is, which way it
 * goes, which way its x points. Starts at 0, 0, 0 going along y, x along x, lying flat facing up. */
interface Middle { at: V; along: V; across: V }
const middles = new WeakMap<Bend, Middle[]>()
function middleLine(bend: Bend): Middle[] {
  const known = middles.get(bend)
  if (known) return known
  const line: Middle[] = []
  let [C, T, A, N]: V[] = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [0, 0, 1]]
  const h = 1
  // which way each moves for each metre: on along T; T toward N as it bends; A toward N as it twists; N back
  const slope = (s: number, [, t, a, n]: V[]): V[] => {
    const [k, w] = [bendAt(bend, s), twistAt(bend, s)]
    return [t, n.map(v => k * v) as V, n.map(v => w * v) as V, t.map((v, i) => -k * v - w * a[i]!) as V]
  }
  const step = (y: V[], d: V[], by: number): V[] => y.map((v, i) => v.map((c, j) => c + by * d[i]![j]!) as V)
  for (let s = 0; s <= bend.long + 1e-9; s += h) {
    line.push({ at: C, along: T, across: A })
    const y = [C, T, A, N]
    const k1 = slope(s, y), k2 = slope(s + h / 2, step(y, k1, h / 2)), k3 = slope(s + h / 2, step(y, k2, h / 2)), k4 = slope(s + h, step(y, k3, h))
    ;[C, T, A, N] = y.map((v, i) => v.map((c, j) => c + (h / 6) * (k1[i]![j]! + 2 * k2[i]![j]! + 2 * k3[i]![j]! + k4[i]![j]!)) as V)
    // kept square to each other and of unit length
    const t = unit(xyz(T))
    const a0 = xyz(A)
    const a = unit(add(a0, t, -(a0.x * t.x + a0.y * t.y + a0.z * t.z)))
    const n = cross(a, t)
    ;[T, A, N] = [[t.x, t.y, t.z], [a.x, a.y, a.z], [n.x, n.y, n.z]]
  }
  middles.set(bend, line)
  return line
}

/** The frame of a place of the strip (x across, y along), before the strip is stood by its base. Where the strip
 * twists it leans more the farther from its middle line, and a tile there leans with it. */
function frameRaw(bend: Bend, x: number, y: number): Frame {
  const L = bend.long
  const s = y >= 0 && y <= L ? y : ((y % L) + L) % L // y L itself is the end of the loop, not its start
  const line = middleLine(bend)
  const i = Math.min(Math.floor(s), line.length - 2)
  const [p, q] = [line[i]!, line[i + 1]!]
  const f = s - i
  const mix = (a: V, b: V): Xyz => ({ x: a[0] + (b[0] - a[0]) * f, y: a[1] + (b[1] - a[1]) * f, z: a[2] + (b[2] - a[2]) * f })
  const middle = mix(p.at, q.at)
  const t = unit(mix(p.along, q.along))
  const a0 = mix(p.across, q.across)
  const across = unit(add(a0, t, -(a0.x * t.x + a0.y * t.y + a0.z * t.z)))
  const flatUp = cross(across, t)
  const along = unit(add(t, flatUp, x * twistAt(bend, s)))
  return { at: add(middle, across, x), across, along, up: unit(cross(across, along)) }
}

/** Points along the strip's two edges and its middle line, on both faces, every metre: what its reach is found by. */
function walk(bend: Bend): Xyz[] {
  const points: Xyz[] = []
  for (let y = 0; y <= bend.long; y += 1) {
    for (const x of [-bend.across / 2, 0, bend.across / 2]) {
      const f = frameRaw(bend, x, y)
      for (const z of [-bend.thick / 2, bend.thick / 2]) points.push(add(f.at, f.up, z))
    }
  }
  return points
}

function rawReach(bend: Bend): { low: Xyz; high: Xyz } {
  let [lx, ly, lz, hx, hy, hz] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity]
  for (const p of walk(bend)) {
    lx = Math.min(lx, p.x); ly = Math.min(ly, p.y); lz = Math.min(lz, p.z)
    hx = Math.max(hx, p.x); hy = Math.max(hy, p.y); hz = Math.max(hz, p.z)
  }
  return { low: { x: lx, y: ly, z: lz }, high: { x: hx, y: hy, z: hz } }
}

const shifts = new WeakMap<Bend, Xyz>()

/** How far the laid strip is moved so that it stands by the middle of its base: the middle of all it covers on
 * x 0, y 0, and its lowest point on z 0. */
export function shiftOf(bend: Bend): Xyz {
  const known = shifts.get(bend)
  if (known) return known
  const { low, high } = rawReach(bend)
  const shift = { x: -(low.x + high.x) / 2, y: -(low.y + high.y) / 2, z: -low.z }
  shifts.set(bend, shift)
  return shift
}

/** The frame of a place of the strip, stood by its base: where a tile laid there goes and how it is turned. */
export function frameOf(bend: Bend, x: number, y: number): Frame {
  const f = frameRaw(bend, x, y)
  return { ...f, at: add(f.at, shiftOf(bend)) }
}

/** A point of the strip (x across, y along, z up from it), stood by its base. */
export function bent(bend: Bend, x: number, y: number, z: number): Xyz {
  const f = frameOf(bend, x, y)
  return add(f.at, f.up, z)
}

/** The same points as `walk`, stood by the strip's base: the ground the strip takes up is round them. */
export function bentWalk(bend: Bend): Xyz[] {
  const shift = shiftOf(bend)
  return walk(bend).map(p => add(p, shift))
}

/** How much room the strip takes: along x, along y, and up. */
export function bentSize(bend: Bend): Xyz {
  const { low, high } = rawReach(bend)
  return { x: high.x - low.x, y: high.y - low.y, z: high.z - low.z }
}
