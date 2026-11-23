// THE MATHS OF SOLIDS (21 Nov 2026, issue 123 in noi-planning). A solid is a shape with flat faces all round:
// its corners as points (x, y, z in metres, z up) and its faces as lists of corners. Everything a solid needs
// worked out is here, as plain sums that a test can check: where it stands, how big it is, the ground it
// covers, its edges, and the triangles and edge rods three.js draws. Nothing here knows three.js or the
// elements; an element's file takes what it needs from here.

/** A corner of a solid, in metres: x and y on the ground, z up. */
export interface Corner {
  readonly x: number
  readonly y: number
  readonly z: number
}

/** A face: the numbers of its corners in order round it, at least three. */
export type Face = readonly number[]

/** A solid: its corners and its faces. */
export interface SolidShape {
  readonly points: readonly Corner[]
  readonly faces: readonly Face[]
}

/** `n` corners evenly round the upright line through x 0, y 0: each `r` metres from it, at the height `z`. The
 * first is at the angle `from` (0 is toward high x; a quarter turn on is toward high y). */
export function ring(n: number, r: number, z: number, from = 0): Corner[] {
  return Array.from({ length: n }, (_, i) => {
    const a = from + (i / n) * 2 * Math.PI
    return { x: r * Math.cos(a), y: r * Math.sin(a), z }
  })
}

/** How far a set of corners reaches along x, along y and up. */
export function reach(points: readonly Corner[]): { x: number; y: number; z: number } {
  const span = (of: (p: Corner) => number) => Math.max(...points.map(of)) - Math.min(...points.map(of))
  return { x: span(p => p.x), y: span(p => p.y), z: span(p => p.z) }
}

/** The same corners moved so that the solid stands by the middle of its base, as every thing does: its lowest
 * corner at z 0, and its reach along x and along y centred on x 0, y 0. */
export function standing(points: readonly Corner[]): Corner[] {
  const mid = (of: (p: Corner) => number) => (Math.max(...points.map(of)) + Math.min(...points.map(of))) / 2
  const [mx, my, low] = [mid(p => p.x), mid(p => p.y), Math.min(...points.map(p => p.z))]
  const tidy = (n: number) => (Math.abs(n) < 1e-12 ? 0 : n)
  return points.map(p => ({ x: tidy(p.x - mx), y: tidy(p.y - my), z: tidy(p.z - low) }))
}

const middleOf = (points: readonly Corner[]): Corner => ({
  x: points.reduce((s, p) => s + p.x, 0) / points.length,
  y: points.reduce((s, p) => s + p.y, 0) / points.length,
  z: points.reduce((s, p) => s + p.z, 0) / points.length,
})

/** Which way a face looks: the direction square to it, by the order of its corners. */
function looks(points: readonly Corner[], face: Face): Corner {
  // summed over all its corners, so a face of many corners gives a steady answer
  let [x, y, z] = [0, 0, 0]
  face.forEach((k, i) => {
    const [a, b] = [points[k]!, points[face[(i + 1) % face.length]!]!]
    x += (a.y - b.y) * (a.z + b.z)
    y += (a.z - b.z) * (a.x + b.x)
    z += (a.x - b.x) * (a.y + b.y)
  })
  return { x, y, z }
}

/** Which separate part each face belongs to: faces that share a corner are one part. A solid may be several
 * parts that do not touch (two halves with a gap between them). Returns, for each face, the number of its part. */
export function partsOf(points: readonly Corner[], faces: readonly Face[]): number[] {
  const of = points.map((_, k) => k)
  const root = (k: number): number => (of[k] === k ? k : (of[k] = root(of[k]!)))
  for (const face of faces) for (const k of face) of[root(k)] = root(face[0]!)
  const numbered = new Map<number, number>()
  return faces.map(face => {
    const r = root(face[0]!)
    if (!numbered.has(r)) numbered.set(r, numbered.size)
    return numbered.get(r)!
  })
}

/** The same faces, each with its corners in the order that makes it look OUTWARD (from the stuff of the solid
 * toward the air), which is what three.js needs to know the outside from the inside. So a face may be written
 * in either order. Done part by part, and right also for a part with a hole through it: first every face is
 * made to agree with its neighbours (two faces that share an edge must run along it in opposite ways), then the
 * whole part is turned over if it came out inside out (its volume, summed from its faces, would be below 0). */
export function outward(points: readonly Corner[], faces: readonly Face[]): number[][] {
  const out = faces.map(face => [...face])
  const name = (a: number, b: number) => (a < b ? `${a} ${b}` : `${b} ${a}`)
  const on = new Map<string, number[]>()
  out.forEach((face, f) => face.forEach((a, i) => {
    const key = name(a, face[(i + 1) % face.length]!)
    on.set(key, [...(on.get(key) ?? []), f])
  }))
  const runs = (face: readonly number[], a: number, b: number) => face[(face.indexOf(a) + 1) % face.length] === b
  const seen = out.map(() => false)
  for (let start = 0; start < out.length; start++) {
    if (seen[start]) continue
    const members = [start]
    seen[start] = true
    for (let q = 0; q < members.length; q++) {
      const face = out[members[q]!]!
      face.forEach((a, i) => {
        const b = face[(i + 1) % face.length]!
        for (const g of on.get(name(a, b)) ?? []) {
          if (seen[g]) continue
          if (runs(out[g]!, a, b)) out[g]!.reverse()
          seen[g] = true
          members.push(g)
        }
      })
    }
    let volume = 0
    for (const f of members) {
      const face = out[f]!
      const o = points[face[0]!]!
      for (let i = 1; i + 1 < face.length; i++) {
        const [b, c] = [points[face[i]!]!, points[face[i + 1]!]!]
        volume += o.x * (b.y * c.z - b.z * c.y) - o.y * (b.x * c.z - b.z * c.x) + o.z * (b.x * c.y - b.y * c.x)
      }
    }
    if (volume < 0) for (const f of members) out[f]!.reverse()
  }
  return out
}

/** Every edge of a solid, once: the two corners it joins, the lower number first. */
export function edgesOf(faces: readonly Face[]): Array<[number, number]> {
  const seen = new Set<string>()
  const edges: Array<[number, number]> = []
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!
      const key = a < b ? `${a} ${b}` : `${b} ${a}`
      if (seen.has(key)) return
      seen.add(key)
      edges.push(a < b ? [a, b] : [b, a])
    })
  }
  return edges
}

/** What can be counted and checked about a solid, for its tests. */
export function solidFacts(shape: SolidShape) {
  const { points, faces } = shape
  const edges = edgesOf(faces)
  // how many faces meet at each edge: two, everywhere, when the solid is closed
  const meet = new Map<string, number>()
  for (const face of faces) {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!
      const key = a < b ? `${a} ${b}` : `${b} ${a}`
      meet.set(key, (meet.get(key) ?? 0) + 1)
    })
  }
  const lengths = edges.map(([a, b]) => Math.hypot(points[a]!.x - points[b]!.x, points[a]!.y - points[b]!.y, points[a]!.z - points[b]!.z))
  const far = reach(points)
  const mid = (of: (p: Corner) => number) => (Math.max(...points.map(of)) + Math.min(...points.map(of))) / 2
  // flat: every corner of a face lies in the face's own plane
  const flat = faces.every(face => {
    const way = looks(points, face)
    const long = Math.hypot(way.x, way.y, way.z)
    const first = points[face[0]!]!
    return face.every(k => Math.abs(((points[k]!.x - first.x) * way.x + (points[k]!.y - first.y) * way.y + (points[k]!.z - first.z) * way.z) / long) < 1e-9)
  })
  return {
    corners: points.length,
    edges: edges.length,
    faces: faces.length,
    /** Every edge is shared by exactly two faces: no hole, no loose face. */
    closed: [...meet.values()].every(n => n === 2),
    /** How many separate parts it is made of: 1 for most solids. */
    parts: new Set(partsOf(points, faces)).size,
    /** Corners less edges plus faces: 2 for each part without a hole through it, 0 for each part with one. */
    euler: points.length - edges.length + faces.length,
    /** Every face is flat. */
    flat,
    /** It stands by the middle of its base: lowest corner at z 0, centred on x 0, y 0. */
    stands: Math.abs(Math.min(...points.map(p => p.z))) < 1e-9 && Math.abs(mid(p => p.x)) < 1e-9 && Math.abs(mid(p => p.y)) < 1e-9,
    size: far,
    shortestEdge: Math.min(...lengths),
    longestEdge: Math.max(...lengths),
    edgeLengths: lengths,
  }
}

/** The ground a solid stands over, seen from above: the outline round all its corners, as points going round
 * against the clock. */
export function footprint(points: readonly Corner[]): Array<{ x: number; y: number }> {
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

/** A solid's faces as triangles for three.js: nine numbers a triangle (x, y, z of its three corners), no corner
 * shared between faces, so each face is lit flat. Each face is cut from its first corner. */
export function triangles(shape: SolidShape): number[] {
  const out: number[] = []
  for (const face of outward(shape.points, shape.faces)) {
    for (let i = 1; i + 1 < face.length; i++) {
      for (const k of [face[0]!, face[i]!, face[i + 1]!]) out.push(shape.points[k]!.x, shape.points[k]!.y, shape.points[k]!.z)
    }
  }
  return out
}

/** A solid's edges as thin rods for three.js: each edge a rod of `sides` sides and `radius` metres, closed at
 * both ends. Returns the corners of all the rods (three numbers each) and their triangles (three corner numbers
 * each). */
export function rods(shape: SolidShape, radius: number, sides = 6): { positions: number[]; indices: number[] } {
  const positions: number[] = []
  const indices: number[] = []
  for (const [ia, ib] of edgesOf(shape.faces)) {
    const [a, b] = [shape.points[ia]!, shape.points[ib]!]
    const along = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z }
    const long = Math.hypot(along.x, along.y, along.z)
    if (long === 0) continue
    const [ux, uy, uz] = [along.x / long, along.y / long, along.z / long]
    // two directions square to the edge and to each other
    const pick = Math.abs(uz) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
    let [px, py, pz] = [uy * pick.z - uz * pick.y, uz * pick.x - ux * pick.z, ux * pick.y - uy * pick.x]
    const pl = Math.hypot(px, py, pz)
    ;[px, py, pz] = [px / pl, py / pl, pz / pl]
    const [qx, qy, qz] = [uy * pz - uz * py, uz * px - ux * pz, ux * py - uy * px]
    const first = positions.length / 3
    for (const end of [a, b]) {
      for (let s = 0; s < sides; s++) {
        const t = (s / sides) * 2 * Math.PI
        const [c, d] = [Math.cos(t) * radius, Math.sin(t) * radius]
        positions.push(end.x + px * c + qx * d, end.y + py * c + qy * d, end.z + pz * c + qz * d)
      }
    }
    // the two ends' middles, to close the rod
    positions.push(a.x, a.y, a.z, b.x, b.y, b.z)
    const [midA, midB] = [first + 2 * sides, first + 2 * sides + 1]
    for (let s = 0; s < sides; s++) {
      const n = (s + 1) % sides
      indices.push(first + s, first + n, first + sides + s, first + n, first + sides + n, first + sides + s)
      indices.push(midA, first + n, first + s, midB, first + sides + s, first + sides + n)
    }
  }
  return { positions, indices }
}

/** A low-poly ball: twenty triangles (an icosahedron), each cut into four `cuts` times over, every corner
 * pushed out to `radius` metres from the middle. 0 cuts: 20 faces; 1 cut: 80; 2 cuts: 320. Not yet standing:
 * its middle is at 0, 0, 0. */
export function lowPolyBall(radius: number, cuts = 1): SolidShape {
  const t = (1 + Math.sqrt(5)) / 2
  let points: Corner[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t],
    [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1],
  ].map(([x, y, z]) => ({ x: x!, y: y!, z: z! }))
  let faces: number[][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ]
  for (let cut = 0; cut < cuts; cut++) {
    const between = new Map<string, number>()
    const halfway = (a: number, b: number) => {
      const key = a < b ? `${a} ${b}` : `${b} ${a}`
      const had = between.get(key)
      if (had !== undefined) return had
      points.push({ x: (points[a]!.x + points[b]!.x) / 2, y: (points[a]!.y + points[b]!.y) / 2, z: (points[a]!.z + points[b]!.z) / 2 })
      between.set(key, points.length - 1)
      return points.length - 1
    }
    faces = faces.flatMap(([a, b, c]) => {
      const [ab, bc, ca] = [halfway(a!, b!), halfway(b!, c!), halfway(c!, a!)]
      return [[a!, ab, ca], [b!, bc, ab], [c!, ca, bc], [ab, bc, ca]]
    })
  }
  points = points.map(p => {
    const long = Math.hypot(p.x, p.y, p.z)
    return { x: (p.x / long) * radius, y: (p.y / long) * radius, z: (p.z / long) * radius }
  })
  return { points, faces }
}

/** The same solid with every edge and corner CUT: each face is drawn a little smaller inside itself (every
 * corner of it moved `width` metres toward the face's middle), a narrow strip joins each pair of faces where
 * their edge was, and a small face closes each corner. Light catches the strips, which is what shows the edges
 * of a glossy thing. The cut solid lies just inside the first one. */
export function bevelled(shape: SolidShape, width: number): SolidShape {
  const faces = outward(shape.points, shape.faces)
  const points: Corner[] = []
  const cornerOf = new Map<string, number>() // face and corner -> the new corner inside that face
  // which face has the edge from a to b in its own order
  const faceWith = new Map<string, number>()
  faces.forEach((face, f) => {
    const mid = middleOf(face.map(k => shape.points[k]!))
    face.forEach((k, i) => {
      const p = shape.points[k]!
      const far = Math.hypot(mid.x - p.x, mid.y - p.y, mid.z - p.z)
      const share = Math.min(width / far, 0.45)
      cornerOf.set(`${f} ${k}`, points.length)
      points.push({ x: p.x + (mid.x - p.x) * share, y: p.y + (mid.y - p.y) * share, z: p.z + (mid.z - p.z) * share })
      faceWith.set(`${k} ${face[(i + 1) % face.length]!}`, f)
    })
  })
  const at = (f: number, k: number) => cornerOf.get(`${f} ${k}`)!
  const out: number[][] = faces.map((face, f) => face.map(k => at(f, k)))
  // a strip for each edge, as two triangles (its four corners need not lie flat together)
  const done = new Set<string>()
  faces.forEach((face, f) => {
    face.forEach((a, i) => {
      const b = face[(i + 1) % face.length]!
      const key = a < b ? `${a} ${b}` : `${b} ${a}`
      const g = faceWith.get(`${b} ${a}`)
      if (done.has(key) || g === undefined) return
      done.add(key)
      out.push([at(f, a), at(g, a), at(g, b)], [at(f, a), at(g, b), at(f, b)])
    })
  })
  // a small face for each corner: the new corners of the faces that met there, going round it, as triangles
  shape.points.forEach((_, k) => {
    const first = faces.findIndex(face => face.includes(k))
    if (first === -1) return
    const round: number[] = []
    let f = first
    do {
      round.push(at(f, k))
      const face = faces[f]!
      const next = face[(face.indexOf(k) + 1) % face.length]!
      const g = faceWith.get(`${next} ${k}`)
      if (g === undefined) break
      f = g
    } while (f !== first && round.length <= faces.length)
    for (let i = 1; i + 1 < round.length; i++) out.push([round[0]!, round[i]!, round[i + 1]!])
  })
  return { points, faces: out }
}

/** A smaller ball that goes round a bigger thing: how far across it is, how far out from the middle it goes
 * round, where on its round it starts (degrees), and how far above or below the flat of the round it is. */
export interface Moon {
  readonly across: number
  readonly out: number
  readonly startsAt: number
  readonly above: number
}

/** `count` moons of different sizes, spread round, by plain sums from a number (`seed`): the same number gives
 * the same moons every time, so nothing about them is left to chance. Sizes run from `smallest` to `largest`
 * metres across, with more small ones than large; they go round between `nearest` and `farthest` metres out,
 * up to `spread` metres above or below the flat of their round, and `loose` says how unevenly they are spaced
 * (0: evenly). With the same nearest and farthest, no spread and no looseness, they are all on ONE circle. */
export function moons(count: number, seed: number, sizes: readonly [number, number], outs: readonly [number, number], spread = 0.05, loose = 0.7): Moon[] {
  let state = seed >>> 0
  const next = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 4294967296
  }
  const round3 = (n: number) => Math.round(n * 1000) / 1000
  return Array.from({ length: count }, (_, i) => ({
    across: round3(sizes[0] + (sizes[1] - sizes[0]) * next() ** 2.2),
    out: round3(outs[0] + (outs[1] - outs[0]) * next()),
    startsAt: round3(((i + (next() - 0.5) * loose) / count) * 360),
    above: round3((next() - 0.5) * 2 * spread),
  }))
}

/** Where a moon's middle is after `seconds`, in metres from the middle of what it goes round: the round leans
 * `lean` degrees from level (about the x axis), and one whole turn takes `turnEvery` seconds (0: it stays). */
export function moonPlace(moon: Moon, lean: number, turnEvery: number, seconds: number): Corner {
  const a = ((moon.startsAt + (turnEvery > 0 ? (seconds / turnEvery) * 360 : 0)) * Math.PI) / 180
  const [x, y, z] = [moon.out * Math.cos(a), moon.out * Math.sin(a), moon.above]
  const l = (lean * Math.PI) / 180
  return { x, y: y * Math.cos(l) - z * Math.sin(l), z: y * Math.sin(l) + z * Math.cos(l) }
}

/** How far a part that turns in clicks has turned after `seconds`, in degrees about the upright line (above 0 is
 * from x toward y). It turns as a ring of a lock that is opened by a code: `code` says how many clicks each move
 * is, one move after another and then again from the first; a click is `click` degrees and takes `clickFor`
 * seconds; between two moves the part rests `restFor` seconds. A move starts and ends gently. `part` is which
 * part it is, counted from 0: every second part turns the opposite way, at the same moments and as far. */
export function turned(turning: { readonly click: number; readonly code: readonly number[]; readonly clickFor: number; readonly restFor: number }, part: number, seconds: number): number {
  const inAll = turning.code.reduce((sum, clicks) => sum + clicks, 0)
  const round = inAll * turning.clickFor + turning.code.length * turning.restFor
  if (!(round > 0) || !(seconds > 0)) return 0
  let clicks = Math.floor(seconds / round) * inAll
  let left = seconds % round
  for (const move of turning.code) {
    const moveFor = move * turning.clickFor
    if (left < moveFor) {
      const p = left / moveFor
      clicks += move * p * p * (3 - 2 * p)
      break
    }
    clicks += move
    left -= moveFor
    if (left < turning.restFor) break
    left -= turning.restFor
  }
  return clicks === 0 ? 0 : clicks * turning.click * (part % 2 === 0 ? 1 : -1)
}
