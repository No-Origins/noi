// AN ELEMENT SEEN FROM ABOVE (21 Nov 2026, issue 123 in noi-planning): its outline, what it leaves open, and the
// ground it covers, worked out from its data (element.ts) alone. The picture (make.ts) raises these outlines;
// whoever lays elements side by side asks what ground each covers.
// How many straight pieces draw a rounded corner (CORNER_PIECES) is this file's precision.
import { bentWalk } from './bend.ts'
import { noSuchShape, type Astroid, type Flat, type Laid, type Piece, type Pieces, type Slab, type WorldElement } from './element.ts'
import type { Size, Xyz } from './space.ts'

/** Whether a spot of ground, `dx` and `dy` metres from an element's middle, is under the element. */
export function covers(e: WorldElement, dx: number, dy: number): boolean {
  const [ax, ay] = [Math.abs(dx), Math.abs(dy)]
  const [hx, hy] = [e.size.x / 2, e.size.y / 2]
  if (ax > hx || ay > hy) return false
  switch (e.shape.kind) {
    case 'slab': {
      // all of the rectangle, less what each rounded corner leaves open
      const r = Math.min(e.shape.cornerRadius, hx, hy)
      return !(ax > hx - r && ay > hy - r && Math.hypot(ax - (hx - r), ay - (hy - r)) > r)
    }
    case 'astroid':
      // what is outside all four circles whose quarters are its sides
      return Math.hypot(ax - e.shape.radius, ay - e.shape.radius) >= e.shape.radius
    case 'ring': {
      // the band between its two circles
      const out = Math.hypot(dx, dy)
      return out >= e.shape.inner && out <= e.shape.outer
    }
    case 'pieces':
      // the ground it takes up: all that lies within the outline round its pieces, the gaps between them too
      return inside(roundPieces(e.shape), dx, dy)
    case 'laid':
      // the ground it takes up: all that lies within the outline round what it is laid from
      return inside(roundLaid(e.shape), dx, dy)
    default:
      return noSuchShape(e.shape)
  }
}

/** Whether a spot of ground, `dx` and `dy` metres from an element's middle, is under the element's border. */
export function inBorder(e: WorldElement, dx: number, dy: number): boolean {
  const within = withinBorder(e)
  return within !== null && covers(e, dx, dy) && !covers(within, dx, dy)
}

/** What of an element lies inside its border: the same shape, smaller by the border's width all round, its
 * corners rounded by that much less. Null when the element has no border. Only a slab can have one so far. */
export function withinBorder(e: WorldElement): WorldElement | null {
  if (!e.border || e.shape.kind !== 'slab') return null
  const w = e.border.width
  return {
    ...e,
    size: { x: e.size.x - 2 * w, y: e.size.y - 2 * w, z: e.size.z },
    shape: { kind: 'slab', cornerRadius: Math.max(0, e.shape.cornerRadius - w) },
    border: undefined,
  }
}

/** What of a piece lies inside its border: the same piece, smaller by the border's width all round, its corners
 * rounded by that much less. Null when the piece has no border. Only a slab can have one. */
export function withinPieceBorder(piece: Piece): Piece | null {
  if (!piece.border || piece.shape.kind !== 'slab') return null
  const w = piece.border.width
  return {
    ...piece,
    size: { x: piece.size.x - 2 * w, y: piece.size.y - 2 * w, z: piece.size.z },
    shape: { ...piece.shape, cornerRadius: Math.max(0, piece.shape.cornerRadius - w) },
    border: undefined,
  }
}

/** How many straight pieces draw one rounded corner. */
export const CORNER_PIECES = 24

/** An element's outline seen from above, as points in metres round 0, 0 (x, y), going round against the clock. */
export function outline(e: WorldElement, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  switch (e.shape.kind) {
    case 'slab':
    case 'astroid':
    case 'ring': return flatOutline(e.shape, e.size, pieces)
    case 'pieces': return roundPieces(e.shape, pieces)
    case 'laid': return roundLaid(e.shape)
    default: return noSuchShape(e.shape)
  }
}

/** A flat shape's outline seen from above, round 0, 0, going round against the clock. A ring's is its outer
 * circle; what it leaves open is in `holesOf`. */
export function flatOutline(shape: Flat, size: Size, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  switch (shape.kind) {
    case 'slab': return slabOutline(size, shape, pieces)
    case 'astroid': return astroidOutline(shape, pieces)
    case 'ring': return circle(shape.outer, pieces)
    default: return noSuchShape(shape)
  }
}

/** What a flat shape leaves open inside its outline: for a ring, its inner circle; for a slab, its round holes. */
export function holesOf(shape: Flat, pieces = CORNER_PIECES): Array<Array<{ x: number; y: number }>> {
  if (shape.kind === 'ring') return [circle(shape.inner, pieces)]
  if (shape.kind === 'slab') return (shape.holes ?? []).map(hole => circle(hole.radius, pieces).map(p => ({ x: hole.x + p.x, y: hole.y + p.y })))
  return []
}

/** A circle as points round 0, 0, against the clock: four times as many straight pieces as a rounded corner has. */
function circle(r: number, pieces: number) {
  return Array.from({ length: 4 * pieces }, (_, i) => {
    const a = (i / (4 * pieces)) * 2 * Math.PI
    return { x: r * Math.cos(a), y: r * Math.sin(a) }
  })
}

/** Points of a piece's own shape, as they are where the piece stands inside its element: turned, then moved
 * to its place. */
function inElement(piece: Piece, points: ReadonlyArray<{ x: number; y: number }>) {
  const a = ((piece.turn ?? 0) * Math.PI) / 180
  return points.map(p => ({
    x: piece.at.x + p.x * Math.cos(a) - p.y * Math.sin(a),
    y: piece.at.y + p.x * Math.sin(a) + p.y * Math.cos(a),
  }))
}

/** One piece's outline seen from above, where the piece stands inside its element. A piece that faces the
 * front is seen from above as the strip it is raised through: as wide as its outline, from its base forward. */
export function pieceOutline(piece: Piece, pieces = CORNER_PIECES): Array<{ x: number; y: number }> {
  if (piece.faces === 'front') {
    const [half, deep] = [piece.size.x / 2, piece.size.z]
    return inElement(piece, [{ x: 0 - half, y: 0 - deep }, { x: half, y: 0 - deep }, { x: half, y: 0 }, { x: 0 - half, y: 0 }])
  }
  return inElement(piece, flatOutline(piece.shape, piece.size, pieces))
}

/** What one piece leaves open seen from above, where the piece stands inside its element. */
export function pieceHoles(piece: Piece, pieces = CORNER_PIECES): Array<Array<{ x: number; y: number }>> {
  if (piece.faces === 'front') return []
  return holesOf(piece.shape, pieces).map(hole => inElement(piece, hole))
}

/** The outline round all the pieces of a thing, with no dents: the ground the thing takes up. */
function roundPieces(shape: Pieces, pieces = CORNER_PIECES) {
  return footprint(shape.pieces.flatMap(piece => pieceOutline(piece, pieces).map(p => ({ ...p, z: 0 }))))
}

/** The outline round all that a thing is laid from, with no dents: the ground the thing takes up. Worked out
 * once for each such thing: it may be laid from thousands. */
const laidRound = new WeakMap<Laid, Array<{ x: number; y: number }>>()
function roundLaid(shape: Laid) {
  let round = laidRound.get(shape)
  if (!round) {
    // each element's own outline once, then moved to every place that element lies on
    const own = new Map<WorldElement, Array<{ x: number; y: number }>>()
    const ownOutline = (e: WorldElement) => {
      let points = own.get(e)
      if (!points) { points = outline(e); own.set(e, points) }
      return points
    }
    // the corners of the largest of the elements it is laid from (its tiles)
    const largest = Math.max(...shape.things.map(t => t.element.size.x * t.element.size.y))
    const tiles = shape.things.filter(t => !t.under && t.element.size.x * t.element.size.y === largest)
    // a bent thing takes up the ground round its bent strip, seen from above (bend.ts)
    round = shape.bend ? footprint(bentWalk(shape.bend))
      // a strip of another shape (wave.ts): the ground round every corner of its tiles, seen from above
      : shape.frame ? footprint(tiles.flatMap(t => [[-1, -1], [-1, 1], [1, -1], [1, 1]].map(([i, j]) => shape.frame!(t.at.x + (i! * t.element.size.x) / 2, t.at.y + (j! * t.element.size.y) / 2).at)))
      : footprint(shape.things.flatMap(t => ownOutline(t.element).map(p => ({ x: t.at.x + p.x, y: t.at.y + p.y, z: 0 }))))
    laidRound.set(shape, round)
  }
  return round
}

/** A quarter of a circle as points: round `middle`, `r` metres out, from the angle `from` a quarter turn on,
 * against the clock (`turn` 1) or with it (`turn` -1). The last point is left out when `open`. */
function quarter(middle: { x: number; y: number }, r: number, from: number, turn: 1 | -1, pieces: number, open: boolean) {
  const points: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= pieces - (open ? 1 : 0); i++) {
    const a = from + turn * (i / pieces) * (Math.PI / 2)
    points.push({ x: middle.x + r * Math.cos(a), y: middle.y + r * Math.sin(a) })
  }
  return points
}

/** A slab from above, from the corner at high x and low y. Each rounded corner is a quarter circle of the
 * slab's radius, so the straight part of each side is shorter than the side by twice the radius. */
function slabOutline(size: Size, slab: Slab, pieces: number) {
  const [hx, hy] = [size.x / 2, size.y / 2]
  const r = Math.min(slab.cornerRadius, hx, hy)
  if (r === 0) return [{ x: hx, y: -hy }, { x: hx, y: hy }, { x: -hx, y: hy }, { x: -hx, y: -hy }]
  return [
    ...quarter({ x: hx - r, y: -hy + r }, r, -Math.PI / 2, 1, pieces, false),
    ...quarter({ x: hx - r, y: hy - r }, r, 0, 1, pieces, false),
    ...quarter({ x: -hx + r, y: hy - r }, r, Math.PI / 2, 1, pieces, false),
    ...quarter({ x: -hx + r, y: -hy + r }, r, Math.PI, 1, pieces, false),
  ]
}

/** An astroid from above, from its point at high x. Each side is the rounded corner of the slab that lies
 * beyond it: a quarter circle whose middle is `radius` out along both x and y, bending in toward 0, 0. */
function astroidOutline(astroid: Astroid, pieces: number) {
  const r = astroid.radius
  return [
    ...quarter({ x: r, y: r }, r, -Math.PI / 2, -1, pieces, true), // from x r, y 0 to x 0, y r
    ...quarter({ x: -r, y: r }, r, 0, -1, pieces, true), // on to x -r, y 0
    ...quarter({ x: -r, y: -r }, r, Math.PI / 2, -1, pieces, true), // on to x 0, y -r
    ...quarter({ x: r, y: -r }, r, Math.PI, -1, pieces, true), // and back to x r, y 0
  ]
}

/** The outline round points seen from above, with no dents (the ground they take up), going round against the
 * clock. */
export function footprint(points: readonly Xyz[]): Array<{ x: number; y: number }> {
  const flat = [...new Map(points.map(p => [`${p.x.toFixed(9)} ${p.y.toFixed(9)}`, { x: p.x, y: p.y }])).values()]
    .sort((a, b) => a.x - b.x || a.y - b.y)
  if (flat.length < 3) return flat
  const turn = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
  const half = (list: Array<{ x: number; y: number }>) => {
    const hull: Array<{ x: number; y: number }> = []
    for (const p of list) {
      while (hull.length >= 2 && turn(hull[hull.length - 2]!, hull[hull.length - 1]!, p) <= 1e-12) hull.pop()
      hull.push(p)
    }
    hull.pop()
    return hull
  }
  return [...half(flat), ...half([...flat].reverse())]
}

/** Whether a spot is inside an outline that has no dents and goes round against the clock. */
export function inside(outline: ReadonlyArray<{ x: number; y: number }>, x: number, y: number): boolean {
  return outline.every((a, i) => {
    const b = outline[(i + 1) % outline.length]!
    return (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x) >= -1e-9
  })
}
