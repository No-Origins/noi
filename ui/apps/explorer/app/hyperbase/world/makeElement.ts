// AN ELEMENT AS A THING IN THE WORLD (21 Nov 2026, issue 123 in noi-planning): made by three.js from the
// element's data (elements.ts) and from nothing else. The thing is made for the stage's `xyz`: its outline lies
// in x and y, it rises along z, and the middle of its base is its own middle point, so that putting it on a
// place is giving it that place. An element with a border is two parts that share that middle point: what lies
// inside the border, and the border round it, each through the element's whole thickness.
//
// A SOLID is drawn from its corners and faces (solids.ts): its faces as flat triangles, in its surface; and,
// when it has lit edges, every edge as a thin rod that is not lit by anything but gives off its own colour.
// GLASS is see-through and glossy: it hides only a little of what is behind it, and it mirrors a plain room
// made here for that purpose alone (two soft lamps in the dark), so its gloss shows without lighting the rest
// of the world.
//
// FROSTED glass (the stage, 23 Nov 2026) lets what is behind it through, softened, and its thin edge gives off a
// little light. A PIECE WITH A BORDER is two parts, as a base tile is; and a border can be lit by the state the
// thing is in (elements.ts, `glow`): it then gives off a colour, whatever light falls on it. A MATTE surface
// may be made to shine all the same (elements.ts, `shine`): smoother, and mirroring the room.
import type * as THREE_ from 'three/webgpu'
import type { BufferGeometry, Material, Object3D } from 'three/webgpu'
import { flatOutline, holesOf, outline, pieceHoles, pieceOutline, pieceTurn, poseIn, withinBorder, withinPieceBorder, type ElementState, type Laid, type Piece, type Surface, type WorldElement } from './elements.ts'
import { frameOf } from './bend.ts'
import type { Place } from './place.ts'
import { bevelled, lowPolyBall, moonPlace, partsOf, reach, rods, standing, triangles, turned, type Face } from './solids.ts'
import type { World } from './world.ts'

/** One part an element is drawn as: a shape and a surface as three.js holds them. `turns` is set on a part that
 * turns by itself: which one it is, counted from 0 from the lowest up. */
interface Part {
  name: string
  shape: BufferGeometry
  surface: Material
  turns?: number
  /** Set on a piece that spins by itself: the piece. Its shape is then round its own middle, to be put on the
   * piece's place and turned there. */
  spins?: Piece
  /** How far above the element's base this part's own base is, in metres, when it is not on it. */
  up?: number
  /** Set on a piece that faces the front: the piece. Its shape is then round its own middle, to be stood
   * upright on the piece's place. */
  front?: Piece
  /** The part of the element this belongs to, when it is one of several pieces that move together. */
  partOf?: string
  /** Set on one part of a piece a state can light (its border, or itself when it has none): what the state
   * lights it by. The piece's name; how lit its border is, from 0 to 1; whether the border is lit only where
   * it looks up (1) or all of it (0); how lit the piece's whole top face is, from 0 to 1; the colour of the
   * border where it looks up or down (`colour`), where it looks sideways (`side`), and of the piece's whole top
   * face (`topColour`), each as bright as the state says. */
  lights?: { piece: string; lit: { value: number }; upOnly: { value: number }; top: { value: number }; colour: { value: Tint }; side: { value: Tint }; topColour: { value: Tint } }
}

/** A colour as three.js holds it, as far as this file sets one: to a colour of the page, then so bright. */
interface Tint { set(colour: string): { multiplyScalar(by: number): unknown } }

export interface Made {
  /** The thing, ready to be put into `xyz`: whoever uses it gives it its place. */
  readonly thing: Object3D
  /** What moves with the element as it acts out its state (it rises, leans, goes round): a thing set on the
   * element is put in here, so that it goes with it. */
  readonly body: Object3D
  /** Moves what moves in it (the moons going round, the parts that turn, the pieces that spin, and what its
   * state has it do) to where it is after this many seconds. Only when it has something that moves. */
  step?(seconds: number): void
  /** Puts it in another of its element's states, by the state's id; it goes over smoothly, or `atOnce` (a
   * thing made again in another size is at once in the state the one before it was in). Says whether the
   * element has such a state. */
  state(id: string, atOnce?: boolean): boolean
  /** Gives one of its element's own colours (elements.ts, ElementColour, by its id) another colour, a role of
   * Eidos by its token's name: to try it out. Says whether the element has such a colour. */
  colour(id: string, token: string): boolean
  /** Where one looks out of it, when its element says one can: a thing with no shape, on the eye's place, that
   * goes and turns with the element. One looks along its low y. */
  readonly lookOut?: Object3D
  /** Takes it out of the world and gives the card's memory back. */
  gone(): void
}

/** A glossy surface. MY PICKS: how smooth the colour itself is and its clear coat (0 is a mirror, 1 is matte),
 * and how strongly it mirrors the room. */
const GLOSS = { roughness: 0.16, coatRoughness: 0.04, mirrors: 2.2 } as const

/** Frosted glass. MY PICKS: how rough it is (0 is clear as water, 1 scatters everything), and how strongly its
 * thin edge gives off its colour (1 would be the colour itself). */
const FROST = { roughness: 0.55, edge: 0.85 } as const

/** How long a thing takes to go over from one state to another, in seconds: rising, settling, its fans
 * picking up speed. After that it is exactly where its state says. MY PICK, not the user's word. */
const CHANGE = 1.2

/** The light a lit edge gives off round itself. MY PICKS: how many times the edge's own thickness it reaches,
 * and how strong it is at its middle (1 would be as bright as the edge). */
const GLOW = { reach: 5, strength: 0.55 } as const

// The room a glossy or glass thing mirrors, one for each open stage: dark, with soft lamps round it. It is
// never seen itself. Places in it are in the user's x, y, z, as `xyz` turns them.
const rooms = new WeakMap<World, ReturnType<typeof makeRoom>>()
function makeRoom(world: World) {
  const THREE = world.three
  const room = new THREE.Scene()
  const turned = new THREE.Group()
  turned.quaternion.copy(world.xyz.quaternion)
  turned.scale.copy(world.xyz.scale) // the user's x is turned round (place.ts): `xyz` carries that as a mirror
  room.add(turned)
  const dark = new THREE.Mesh(new THREE.BoxGeometry(40, 40, 40), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color('#050505'), side: THREE.BackSide }))
  const lamp = (w: number, d: number, x: number, y: number, z: number, strength: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, d, 0.2), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(strength, strength, strength) }))
    m.position.set(x, y, z)
    return m
  }
  // lamps on every side, so each face of a glossy thing has something to mirror: overhead, toward low y and
  // high x (where the sun is), toward low x, and behind. (Till 22 Nov 2026 each x here had the other sign: the
  // user had x turned round, and the lamps stay where they were.)
  turned.add(dark, lamp(7, 7, -2, -3, 18, 3), lamp(7, 7, 14, -12, 8, 2.4), lamp(6, 6, -17, -2, 7, 1.8), lamp(7, 7, -3, 17, 9, 1.4))
  const made = new THREE.PMREMGenerator(world.renderer).fromScene(room, 0.03)
  return made.texture
}
function roomFor(world: World) {
  let room = rooms.get(world)
  if (!room) { room = makeRoom(world); rooms.set(world, room) }
  return room
}

/** The parts an element is drawn as, each a shape and a surface as three.js holds them: one part for an element
 * without a border; for one with a border, what lies inside the border, and the border round it. */
function parts(world: World, element: WorldElement, colourOf: (token: string) => string, still = false): Part[] {
  // a thing laid from other elements has no parts of its own: it is those elements, drawn on their places (makeLaid)
  if (element.shape.kind === 'laid') return []
  const THREE = world.three
  const TSL = world.tsl
  const points = (e: WorldElement) => outline(e).map(p => new THREE.Vector2(p.x, p.y))
  // an outline seen from above, raised to the element's thickness: a flat shape of three.js lies in x and y and
  // is raised along z, which inside `xyz` is the ground and up
  const raised = (flat: InstanceType<typeof THREE.Shape>) => new THREE.ExtrudeGeometry(flat, { depth: element.size.z, bevelEnabled: false })
  // matte: light is scattered evenly and nothing shines back. `shine` (elements.ts, Surface): made to shine
  // all the same, from 0 (not at all) to 1 (as smooth as a glossy surface, and mirroring the room as much)
  const matte = (token: string, shine = 0) => {
    const surface = new THREE.MeshStandardNodeMaterial({ color: new THREE.Color(colourOf(token) || '#808080'), roughness: 1 - shine * (1 - GLOSS.roughness), metalness: 0 })
    if (shine > 0) {
      surface.envMap = roomFor(world)
      surface.envMapIntensity = shine * GLOSS.mirrors
    }
    return surface
  }
  // glass: smooth and clear. Light goes through it (so what is behind shows, a little bent), and its gloss is
  // the room mirrored in it. Drawn from both sides, so the far faces show through the near ones.
  const glass = (token: string, hides: number) => {
    const surface = new THREE.MeshPhysicalNodeMaterial({ color: new THREE.Color(colourOf(token) || '#808080'), roughness: 0.03, metalness: 0 })
    surface.transmission = 1 - hides
    surface.thickness = 0.05
    surface.ior = 1.45
    surface.side = THREE.DoubleSide
    surface.envMap = roomFor(world)
    return surface
  }
  // glossy: its own colour, smooth, under a clear coat that mirrors the room: nothing shows through it
  const glossy = (token: string) => {
    const surface = new THREE.MeshPhysicalNodeMaterial({ color: new THREE.Color(colourOf(token) || '#808080'), roughness: GLOSS.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: GLOSS.coatRoughness })
    surface.envMap = roomFor(world)
    surface.envMapIntensity = GLOSS.mirrors
    return surface
  }
  // lit: its own colour whatever light falls on it
  const lit = (token: string) => new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(colourOf(token) || '#808080') })
  // WHAT A STATE LIGHTS A BORDER BY (elements.ts, `glow`): how lit the border is, from 0 to 1; whether only
  // where it looks up; how lit the piece's whole top face is; and the colours they give off. The thing sets
  // these as it goes from state to state.
  const lightFor = () => ({ lit: TSL.uniform(0), upOnly: TSL.uniform(0), top: TSL.uniform(0), colour: TSL.uniform(new THREE.Color(0, 0, 0)), side: TSL.uniform(new THREE.Color(0, 0, 0)), topColour: TSL.uniform(new THREE.Color(0, 0, 0)) })
  type Light = ReturnType<typeof lightFor>
  // the light a lit border gives off: its colour where it looks up or down, the colour of its sides where it
  // looks sideways; as strong as it is lit; on all of it or only where it looks up
  const lightOf = (l: Light) => {
    const looks = TSL.normalLocal.mul(TSL.normalLocal)
    return TSL.mix(l.colour, l.side, looks.x.add(looks.y)).mul(l.lit).mul(TSL.mix(TSL.float(1), TSL.step(0.5, TSL.normalLocal.z), l.upOnly))
  }
  // the light a piece's whole top face gives off when a state lights that: its colour, as strong as it is lit
  const topOf = (l: Light) => l.topColour.mul(l.top).mul(TSL.step(0.5, TSL.normalLocal.z))
  // matte (shining so much), and giving off a light of its own besides: a border that is lit, or a top face
  const matteWith = (token: string, gives: ReturnType<typeof lightOf>, shine = 0) => {
    const surface = matte(token, shine)
    surface.emissiveNode = gives
    return surface
  }
  // frosted glass: light goes through it and is scattered on the way, so what is behind shows softened; it
  // mirrors nothing; its thin edge (every face that does not look up or down) gives off a little of its colour.
  // As a border round glass (`light`, `middle`): only its outer wall is an edge (the inner one looks in at the
  // glass it is round), and when a state lights it, it gives off that light instead of its edge's own. As the
  // glass `inside` a border: it has no edge.
  const frosted = (s: Surface, as?: { light: Light; middle: { x: number; y: number } } | 'inside') => {
    const own = new THREE.Color(colourOf(s.colour) || '#808080')
    const surface = new THREE.MeshPhysicalNodeMaterial({ color: own, roughness: s.frost ?? FROST.roughness, metalness: 0 })
    surface.transmission = 1 - (s.hides ?? 0.15)
    surface.thickness = 0.05
    surface.ior = 1.3
    const sideways = TSL.float(1).sub(TSL.normalLocal.z.mul(TSL.normalLocal.z))
    const edge = TSL.color(own).mul(sideways).mul(FROST.edge)
    if (!as) surface.emissiveNode = edge
    else if (as !== 'inside') {
      const outward = TSL.step(0, TSL.normalLocal.xy.dot(TSL.positionLocal.xy.sub(TSL.vec2(as.middle.x, as.middle.y))))
      surface.emissiveNode = edge.mul(outward).mul(TSL.float(1).sub(as.light.lit)).add(lightOf(as.light))
    }
    return surface
  }
  // the light a lit edge gives off round itself: a wider rod of the same colour that adds its light to what is
  // behind it, strongest beside the edge and fading to nothing at its rim
  const glow = (token: string) => {
    const halo = new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(colourOf(token) || '#808080') })
    halo.transparent = true
    halo.blending = THREE.AdditiveBlending
    halo.depthWrite = false
    // how squarely the wider rod is looked at: 1 along its middle line, 0 at its rim. Over the edge itself
    // (the middle, as wide as the edge) it adds nothing, so the edge stays its own colour exactly.
    const square = TSL.normalView.z.abs()
    const overTheEdge = Math.sqrt(1 - 1 / GLOW.reach ** 2)
    halo.opacityNode = square.pow(3).mul(GLOW.strength).mul(TSL.float(1).sub(TSL.smoothstep(overTheEdge - 0.012, overTheEdge, square)))
    return halo
  }
  // a surface as three.js holds it: made once for each surface in the data, so pieces of one surface share it
  const surfaces = new Map<Surface, Material>()
  const surfaceFor = (s: Surface): Material => {
    let made = surfaces.get(s)
    if (!made) {
      made = s.finish === 'frosted' ? frosted(s) : s.finish === 'glass' ? glass(s.colour, s.hides ?? 0.1) : s.finish === 'glossy' ? glossy(s.colour) : s.finish === 'lit' ? lit(s.colour) : matte(s.colour, s.shine ?? 0)
      surfaces.set(s, made)
    }
    return made
  }
  const surfaceOf = (e: WorldElement) => surfaceFor(e.surface)
  if (element.shape.kind === 'solid') {
    // a cut edge: the solid with every edge and corner cut, set down again on its lowest corner
    const cut = element.cutEdge ? bevelled(element.shape, element.cutEdge.width) : element.shape
    const drawn = element.cutEdge ? { points: standing(cut.points), faces: cut.faces } : cut
    const bodyOf = (faces: readonly Face[]) => {
      const body = new THREE.BufferGeometry()
      body.setAttribute('position', new THREE.Float32BufferAttribute(triangles({ points: drawn.points, faces }), 3))
      body.computeVertexNormals()
      return body
    }
    const surface = surfaceOf(element)
    const made: Part[] = []
    if (element.turning) {
      // parts that turn: each separate part is drawn by itself, so it can turn by itself; counted from the lowest up
      const of = partsOf(drawn.points, drawn.faces)
      const apart = new Map<number, Face[]>()
      drawn.faces.forEach((face, i) => apart.set(of[i]!, [...(apart.get(of[i]!) ?? []), face]))
      const lowest = (faces: readonly Face[]) => Math.min(...faces.flat().map(k => drawn.points[k]!.z))
      const upward = [...apart.values()].sort((a, b) => lowest(a) - lowest(b))
      upward.forEach((faces, n) => made.push({ name: `${element.id} part ${n + 1}`, shape: bodyOf(faces), surface, turns: n }))
    } else {
      made.push({ name: element.id, shape: bodyOf(drawn.faces), surface })
    }
    if (element.edges) {
      const drawn = rods(element.shape, element.edges.width / 2)
      const edges = new THREE.BufferGeometry()
      edges.setAttribute('position', new THREE.Float32BufferAttribute(drawn.positions, 3))
      edges.setIndex(drawn.indices)
      edges.computeVertexNormals()
      made.push({ name: `${element.id} edges`, shape: edges, surface: lit(element.edges.colour) })
      const round = rods(element.shape, (element.edges.width / 2) * GLOW.reach, 12)
      const halo = new THREE.BufferGeometry()
      halo.setAttribute('position', new THREE.Float32BufferAttribute(round.positions, 3))
      halo.setIndex(round.indices)
      halo.computeVertexNormals()
      made.push({ name: `${element.id} edge light`, shape: halo, surface: glow(element.edges.colour) })
    }
    return made
  }
  // an outline seen from above, with what it leaves open, as three.js holds it
  type Outline = ReadonlyArray<{ x: number; y: number }>
  const flatOf = (round: Outline, holes: readonly Outline[]) => {
    const flat = new THREE.Shape(round.map(p => new THREE.Vector2(p.x, p.y)))
    for (const hole of holes) flat.holes.push(new THREE.Path(hole.map(p => new THREE.Vector2(p.x, p.y))))
    return flat
  }
  if (element.shape.kind === 'pieces') {
    // a thing made of pieces: the data says each piece's outline where the piece stands inside the element
    // (already turned and on its place), and each is raised from the element's base by its own thickness; all
    // in the element's one surface
    return element.shape.pieces.flatMap((piece): Part[] => {
      // a piece is in its own surface when it has one, else in the element's
      const surface = surfaceFor(piece.surface ?? element.surface)
      // a piece that faces the front is drawn round its own middle, to be stood upright on its place
      const front = piece.faces === 'front' ? piece : undefined
      // a piece that spins is drawn round its own middle, to be put on its place and turned there; when the
      // thing is drawn `still`, it is drawn where it stands like every other piece
      const spins = piece.spin && !still && !front ? piece : undefined
      const flat = spins || front ? flatOf(flatOutline(piece.shape, piece.size), holesOf(piece.shape)) : flatOf(pieceOutline(piece), pieceHoles(piece))
      const raise = (outlined: InstanceType<typeof THREE.Shape>) => new THREE.ExtrudeGeometry(outlined, { depth: piece.size.z, bevelEnabled: false })
      const one = { spins, front, up: piece.up, partOf: still ? undefined : piece.part }
      const own = piece.surface ?? element.surface
      // how much the piece shines, when it is matte and made to: its border shines as it does
      const shine = own.finish === 'matte' ? own.shine ?? 0 : 0
      const within = withinPieceBorder(piece)
      if (!piece.border || !within) {
        // a matte piece without a border whose top face a state lights has a surface to itself, with that light
        const topLit = !still && own.finish === 'matte' && (element.states ?? []).some(s => s.glow?.tops?.some(t => t.piece === piece.name))
        // or one a state names as lit like a border (a post lit as the block's sides): all of it gives off the light
        const asBorder = !still && own.finish === 'matte' && (element.states ?? []).some(s => s.glow?.borders.some(b => b.piece === piece.name))
        if (!topLit && !asBorder) return [{ name: `${element.id} ${piece.name}`, shape: raise(flat), surface, ...one }]
        const light = lightFor()
        return [{ name: `${element.id} ${piece.name}`, shape: raise(flat), surface: matteWith(own.colour, asBorder ? lightOf(light).add(topOf(light)) : topOf(light), shine), ...one, lights: { piece: piece.name, ...light } }]
      }
      // a piece with a border is two parts, as a base tile is: what lies inside the border, and the border
      // round it (the piece's whole outline with the inside cut out), each through the piece's whole thickness
      const roundOf = (p: Piece) => (spins || front ? flatOutline(p.shape, p.size) : pieceOutline(p))
      const inside = flatOf(roundOf(within), spins || front ? holesOf(within.shape) : pieceHoles(within))
      const band = flatOf(roundOf(piece), [roundOf(within)])
      // the border is matte in its own colour, or in its own surface when it has one (glass round glass); each
      // border has a surface to itself, since a state may light one border and not another
      const light = lightFor()
      const middle = spins || front ? { x: 0, y: 0 } : piece.at
      const glassEdge = piece.border.surface?.finish === 'frosted'
      const edge = piece.border.surface && glassEdge ? frosted(piece.border.surface, { light, middle }) : matteWith(piece.border.colour, lightOf(light), shine)
      // what lies inside the border is in the piece's surface, and its top face takes the light a state gives it
      const inner = own.finish === 'frosted' ? frosted(own, 'inside') : own.finish === 'matte' ? matteWith(own.colour, topOf(light), shine) : surface
      return [
        { name: `${element.id} ${piece.name}`, shape: raise(inside), surface: inner, ...one },
        { name: `${element.id} ${piece.name} border`, shape: raise(band), surface: edge, ...one, lights: { piece: piece.name, ...light } },
      ]
    })
  }
  if (element.shape.kind === 'ring') {
    return [{ name: element.id, shape: raised(flatOf(flatOutline(element.shape, element.size), holesOf(element.shape))), surface: surfaceOf(element) }]
  }
  const within = withinBorder(element)
  if (!element.border || !within) {
    return [{ name: element.id, shape: raised(new THREE.Shape(points(element))), surface: surfaceOf(element) as InstanceType<typeof THREE.Material> }]
  }
  // the border is the whole outline with what lies inside the border cut out of it
  const ring = new THREE.Shape(points(element))
  ring.holes.push(new THREE.Path(points(within)))
  return [
    { name: element.id, shape: raised(new THREE.Shape(points(within))), surface: matte(element.surface.colour) },
    { name: `${element.id} border`, shape: raised(ring), surface: matte(element.border.colour) },
  ]
}

/** Makes one element. `colourOf` gives a colour of Eidos by its token's name, as the page's style has it. */
export function makeElement(world: World, element: WorldElement, colourOf: (token: string) => string): Made {
  if (element.shape.kind === 'laid') return makeLaid(world, element, element.shape, colourOf)
  const THREE = world.three
  const made = parts(world, element, colourOf)
  const thing = new THREE.Group()
  thing.name = element.id
  // what moves with the element as it acts out its state: everything of it is in here
  const body = new THREE.Group()
  body.name = `whole ${element.id}` // not `${element.id} …`: that is how its pieces are named, and one may be called body
  thing.add(body)
  // the parts that move together, each a group of its pieces round the upright line through the element's middle
  const partsByName = new Map<string, InstanceType<typeof THREE.Group>>()
  const partNamed = (name: string) => {
    let group = partsByName.get(name)
    if (!group) {
      group = new THREE.Group()
      group.name = `${element.id} part ${name}`
      body.add(group)
      partsByName.set(name, group)
    }
    return group
  }
  const turners: Array<{ mesh: Object3D; part: number }> = []
  const spinners: Array<{ mesh: Object3D; piece: Piece; spun: number }> = []
  for (const part of made) {
    const mesh = new THREE.Mesh(part.shape, part.surface)
    mesh.name = part.name
    ;(part.partOf ? partNamed(part.partOf) : body).add(mesh)
    if (part.turns !== undefined) turners.push({ mesh, part: part.turns })
    // a piece whose base is above the element's base stands that far up, as its data says
    if (part.up) mesh.position.z = part.up
    if (part.front) {
      // a piece that faces the front: its outline stands upright on its place (what was its y goes up) and it
      // is raised toward low y; then turned about the upright line, as its data says
      mesh.position.set(part.front.at.x, part.front.at.y, part.front.up ?? 0)
      mesh.rotation.set(Math.PI / 2, 0, ((part.front.turn ?? 0) * Math.PI) / 180, 'ZXY')
    }
    if (part.spins) {
      // a piece that spins: on its own place inside the element, as its data says, turned as far as it is at the start
      mesh.position.set(part.spins.at.x, part.spins.at.y, part.up ?? 0)
      mesh.rotation.z = (pieceTurn(part.spins, 0) * Math.PI) / 180
      spinners.push({ mesh, piece: part.spins, spun: 0 })
    }
  }
  // WHERE ONE LOOKS OUT OF IT (elements.ts, LookOut): a thing with no shape on the eye's place, in the part it
  // turns with, so it goes wherever the element and that part go
  let lookOut: Object3D | undefined
  if (element.lookOut) {
    lookOut = new THREE.Object3D()
    lookOut.name = `${element.id} look-out`
    lookOut.position.set(element.lookOut.at.x, element.lookOut.at.y, element.lookOut.at.z)
    ;(element.lookOut.part ? partNamed(element.lookOut.part) : body).add(lookOut)
  }
  // THE MOONS: one small ball drawn many times, each as big and as far out as its data says, in the element's
  // own surface. They go round the middle of the element's shape.
  let step: ((seconds: number) => void) | undefined
  const orbit = element.orbit
  if (orbit && element.shape.kind === 'solid' && made[0]) {
    const ball = lowPolyBall(1, 1)
    const one = new THREE.BufferGeometry()
    one.setAttribute('position', new THREE.Float32BufferAttribute(triangles(ball), 3))
    one.computeVertexNormals()
    const many = new THREE.InstancedMesh(one, made[0].surface, orbit.moons.length)
    many.name = `${element.id} moons`
    const middle = reach(element.shape.points).z / 2
    const put = new THREE.Matrix4()
    const place = (seconds: number) => {
      orbit.moons.forEach((moon, i) => {
        const p = moonPlace(moon, orbit.lean, orbit.turnEvery, seconds)
        put.makeScale(moon.across / 2, moon.across / 2, moon.across / 2).setPosition(p.x, p.y, p.z + middle)
        many.setMatrixAt(i, put)
      })
      many.instanceMatrix.needsUpdate = true
    }
    place(0)
    many.frustumCulled = false
    body.add(many)
    made.push({ name: many.name, shape: one, surface: made[0].surface })
    step = place
  }
  // THE PARTS THAT TURN: each about the upright line through the element's middle, which inside `xyz` is z
  const turning = element.turning
  if (turning && turners.length > 0) {
    const moons = step
    step = seconds => {
      moons?.(seconds)
      for (const { mesh, part } of turners) mesh.rotation.z = (turned(turning, part, seconds) * Math.PI) / 180
    }
  }
  // THE STATE IT IS IN (elements.ts, ElementState), AND THE PIECES THAT SPIN. The element starts in its first
  // state. Each moment its state says where it should be and what it should be doing (`poseIn`), and there it
  // is, exactly. Only when its state has just changed does it go over smoothly, for CHANGE seconds, from where
  // it was: it rises, it settles, its fans pick up speed and run down. A piece that spins turns about the
  // upright line through its own place, as fast as its own data says times what the state says.
  const states = element.states ?? []
  let state = states[0]
  // THE BORDERS A STATE LIGHTS (elements.ts, `glow`): each border that can be lit, how lit it is now (0 to 1),
  // and how lit it was when the state last changed. A state that glows says the colour and the faces of the
  // borders it names; they are set as the thing goes into it, and a border fades as smoothly as the rest.
  const lights = made.flatMap(part => (part.lights ? [{ ...part.lights, is: 0, was: 0, topIs: 0, topWas: 0 }] : []))
  // the colour each of the element's own colours has now: its own to begin with, another while one is tried
  const tried = new Map((element.colours ?? []).map(c => [c.id, c.colour]))
  const lightUp = (s: ElementState | undefined) => {
    if (!s?.glow) return
    const glow = s.glow
    // a part's colour: the one of the element's own colours it names, as that is now; else the glow's
    const colourFor = (named: string | undefined) => colourOf((named ? tried.get(named) : undefined) ?? glow.colour) || '#808080'
    for (const light of lights) {
      const border = glow.borders.find(b => b.piece === light.piece)
      const top = glow.tops?.find(t => t.piece === light.piece)
      if (border) {
        // each as bright as the state says: the colour itself unless it says less; its sides as its border
        // unless it says otherwise
        light.colour.value.set(colourFor(border.colour)).multiplyScalar(border.bright ?? 1)
        light.side.value.set(colourFor(border.colour)).multiplyScalar(border.sidesBright ?? border.bright ?? 1)
        light.upOnly.value = border.faces === 'up' ? 1 : 0
      }
      if (top) light.topColour.value.set(colourFor(top.colour)).multiplyScalar(top.bright ?? 1)
    }
  }
  lightUp(state)
  let since = 0 // seconds it has been in this state
  let last: number | null = null // when it was last moved on
  const is = { x: 0, y: 0, z: 0, heading: 0, lean: 0, spin: poseIn(state, 0).spin }
  const swept = new Map<string, number>() // how far each part is turned, in degrees
  // where it was when its state last changed, and how far it has gone over since: 0 to 1
  let was = { ...is, swept: new Map(swept) }
  let over = 1
  if (spinners.length > 0 || states.length > 0) {
    const others = step
    step = seconds => {
      others?.(seconds)
      const passed = last === null ? 0 : Math.max(0, Math.min(seconds - last, 0.1))
      last = seconds
      since += passed
      over = Math.min(1, over + passed / CHANGE)
      const share = over * over * (3 - 2 * over) // gently off, gently there
      const to = poseIn(state, since)
      const between = (from: number, there: number) => from + (there - from) * share
      is.x = between(was.x, to.x)
      is.y = between(was.y, to.y)
      is.z = between(was.z, to.z)
      is.lean = between(was.lean, to.lean)
      is.heading = was.heading + ((((to.heading - was.heading) % 360) + 540) % 360 - 180) * share // the shorter way round
      is.spin = between(was.spin, to.spin)
      body.position.set(is.x, is.y, is.z)
      body.rotation.set((is.lean * Math.PI) / 180, 0, (is.heading * Math.PI) / 180, 'ZXY')
      for (const [name, group] of partsByName) {
        const turn = between(was.swept.get(name) ?? 0, to.sweep?.part === name ? to.sweep.turn : 0)
        swept.set(name, turn)
        group.rotation.z = (turn * Math.PI) / 180
      }
      for (const light of lights) {
        // lit when the state names its piece's border, dark when it does not
        light.is = between(light.was, state?.glow?.borders.some(b => b.piece === light.piece) ? 1 : 0)
        light.lit.value = light.is
        // and its piece's whole top face, when the state names that
        light.topIs = between(light.topWas, state?.glow?.tops?.some(t => t.piece === light.piece) ? 1 : 0)
        light.top.value = light.topIs
      }
      for (const spinner of spinners) {
        // as far as its own data turns it in the time that passed, times what the state says
        spinner.spun += (pieceTurn(spinner.piece, passed) - pieceTurn(spinner.piece, 0)) * is.spin
        spinner.mesh.rotation.z = ((pieceTurn(spinner.piece, 0) + spinner.spun) * Math.PI) / 180
      }
    }
  }
  return {
    thing,
    body,
    step,
    lookOut,
    state(id, atOnce = false) {
      const next = states.find(s => s.id === id)
      if (!next) return false
      if (next !== state) {
        // it goes over from where it is now
        was = { ...is, swept: new Map(swept) }
        over = 0
        state = next
        since = 0
        for (const light of lights) { light.was = light.is; light.topWas = light.topIs }
        lightUp(next)
        // or is there at once: nothing to go over from
        if (atOnce) over = 1
      }
      return true
    },
    colour(id, token) {
      if (!tried.has(id)) return false
      tried.set(id, token)
      lightUp(state) // what is lit with it now shows it at once
      return true
    },
    gone() {
      thing.removeFromParent()
      for (const part of new Set(made.map(m => m.shape))) part.dispose()
      for (const surface of new Set(made.map(m => m.surface))) surface.dispose()
    },
  }
}

/** Makes a thing that is laid from other elements (elements.ts, Laid): each of those elements is made once and
 * drawn on all its places, as the land's are. It is drawn still and acts out no state. What is placed on it
 * goes into its `body`. */
function makeLaid(world: World, element: WorldElement, shape: Laid, colourOf: (token: string) => string): Made {
  const THREE = world.three
  const thing = new THREE.Group()
  thing.name = element.id
  const body = new THREE.Group()
  body.name = `whole ${element.id}`
  thing.add(body)
  // what is laid on the face below (a bent thing's, bend.ts) is laid turned over, so it is kept apart
  const places = new Map<string, { of: WorldElement; over: boolean; where: Place[] }>()
  for (const laid of shape.things) {
    const key = `${laid.element.id} ${laid.under ? 'under' : 'top'}`
    const group = places.get(key) ?? { of: laid.element, over: !!laid.under, where: [] }
    group.where.push({ x: laid.at.x, y: laid.at.y, z: 0 })
    places.set(key, group)
  }
  // on a strip each thing is put whole on its place, turned as the strip is turned there (bend.ts)
  const bend = shape.bend
  // a strip of another shape says its own frame (wave.ts)
  const laidOn = shape.frame
  const frame = bend || laidOn ? (p: Place) => {
    const f = bend ? frameOf(bend, p.x, p.y) : laidOn!(p.x, p.y)
    return new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.across.x, f.across.y, f.across.z), new THREE.Vector3(f.along.x, f.along.y, f.along.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z),
    ).setPosition(f.at.x, f.at.y, f.at.z)
  } : undefined
  const many = [...places.values()].map(({ of, over, where }) => makeMany(world, of, where, colourOf, over, frame))
  for (const made of many) body.add(made.thing)
  return {
    thing,
    body,
    state: () => false,
    colour: () => false,
    gone() {
      thing.removeFromParent()
      for (const made of many) made.gone()
    },
  }
}

/** Makes one element many times over, each on its own place by the middle of its base: each part is one thing
 * for three.js to draw, however many places there are. Drawn still: what turns or spins in the element does
 * not move here yet. */
export function makeMany(world: World, element: WorldElement, places: readonly Place[], colourOf: (token: string) => string, over = false, frame?: (p: Place) => InstanceType<typeof THREE_.Matrix4>): Made {
  const THREE = world.three
  const made = parts(world, element, colourOf, true)
  const thing = new THREE.Group()
  thing.name = element.id
  const put = new THREE.Matrix4()
  const many = made.map(part => {
    const mesh = new THREE.InstancedMesh(part.shape, part.surface, places.length)
    mesh.name = part.name
    // a piece that faces the front is stood upright and put on its own place in each of the many
    const front = part.front
    const upright = front ? new THREE.Matrix4().makeRotationZ(((front.turn ?? 0) * Math.PI) / 180).multiply(new THREE.Matrix4().makeRotationX(Math.PI / 2)) : null
    places.forEach((p, i) => {
      if (front && upright) put.makeTranslation(p.x + front.at.x, p.y + front.at.y, p.z + (front.up ?? 0)).multiply(upright)
      else put.makeTranslation(p.x, p.y, p.z + (part.up ?? 0))
      // turned over: half a turn about y, so its top faces down from the same place (and stays the right way out)
      if (over) put.multiply(new THREE.Matrix4().makeRotationY(Math.PI))
      // on a strip: what is laid at x, y goes to the strip's place there, turned as the strip is (bend.ts)
      if (frame) put.premultiply(new THREE.Matrix4().makeTranslation(-p.x, -p.y, 0)).premultiply(frame(p))
      mesh.setMatrixAt(i, put)
    })
    mesh.instanceMatrix.needsUpdate = true
    // three.js must know how far the many reach, or it stops drawing them when the first leaves the picture
    mesh.computeBoundingSphere()
    thing.add(mesh)
    return mesh
  })
  return {
    thing,
    body: thing,
    state: () => false, // laid many times, a thing is drawn still: it acts out no state yet
    colour: () => false,
    gone() {
      thing.removeFromParent()
      for (const mesh of many) mesh.dispose()
      for (const part of made) { part.shape.dispose(); part.surface.dispose() }
    },
  }
}
