// AN ELEMENT AS A THING IN THE WORLD (21 Nov 2026, issue 123 in noi-planning): made by three.js from the
// element's data (element.ts) and from nothing else. The thing is made for the world's `xyz`: its outline lies
// in x and y, it rises along z, and the middle of its base is its own middle point, so that putting it on a
// place is giving it that place. An element with a border is two parts that share that middle point: what lies
// inside the border, and the border round it, each through the element's whole thickness.
//
// GLOSSY things mirror a plain room made here for that purpose alone (soft lamps in the dark), so their gloss
// shows without lighting the rest of the world. FROSTED glass (the stage, 23 Nov 2026) lets what is behind it
// through, softened, and its thin edge gives off a little light. A PIECE WITH A BORDER is two parts, as a base
// tile is; and a border can be lit by the state the thing is in (element.ts, `glow`): it then gives off a colour,
// whatever light falls on it. A MATTE surface may be made to shine all the same (element.ts, `shine`): smoother,
// and mirroring the room.
//
// Every number of how a surface looks (noi.eio.world.surface), of the mirrored room (noi.eio.world.room) and of
// how long a change of state takes (noi.eio.world.states) is Eidos's, and so is every colour: an element's by its
// data, the room's and its lamps' by their roles (noi.eio.color.world.room and the light's). Where the room's
// lamps are, places, is this file's own; so is the longest step one picture moves a thing on by (a tenth of a
// second, so that after a pause nothing jumps), and where a face counts as looking up (more up than not).
import type * as THREE_ from 'three/webgpu'
import type { BufferGeometry, Material, Object3D } from 'three/webgpu'
import { frameOf } from './bend.ts'
import { role, value } from './eidos.ts'
import { pieceTurn, poseIn, type ElementState, type Laid, type Piece, type Surface, type WorldElement } from './element.ts'
import { LIGHT } from './light.ts'
import { flatOutline, holesOf, outline, pieceHoles, pieceOutline, withinBorder, withinPieceBorder } from './outline.ts'
import type { ThreeWorld, Xyz } from './space.ts'

/** One part an element is drawn as: a shape and a surface as three.js holds them. */
interface Part {
  name: string
  shape: BufferGeometry
  surface: Material
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
  /** Moves what moves in it (the pieces that spin, and what its state has it do) to where it is after this many
   * seconds. Only when it has something that moves. */
  step?(seconds: number): void
  /** Puts it in another of its element's states, by the state's id; it goes over smoothly, or `atOnce` (a
   * thing made again in another size is at once in the state the one before it was in). Says whether the
   * element has such a state. */
  state(id: string, atOnce?: boolean): boolean
  /** Gives one of its element's own colours (element.ts, ElementColour, by its id) another colour, a role of
   * Eidos by its token's name: to try it out. Says whether the element has such a colour. */
  colour(id: string, token: string): boolean
  /** Where one looks out of it, when its element says one can: a thing with no shape, on the eye's place, that
   * goes and turns with the element. One looks along its low y. */
  readonly lookOut?: Object3D
  /** Takes it out of the world and gives the card's memory back. */
  gone(): void
}

/** A glossy surface: how rough its colour itself is and its clear coat (0 is a mirror, 1 is matte), and how
 * strongly it mirrors the room. */
const GLOSS = {
  roughness: value('noi.eio.world.surface.gloss-roughness'),
  coatRoughness: value('noi.eio.world.surface.gloss-coat-roughness'),
  mirrors: value('noi.eio.world.surface.gloss-mirrors'),
} as const

/** Frosted glass: how strongly its thin edge gives off its colour (1 would be the colour itself), how thick
 * three.js takes it to be, and how much it bends the light through it. */
const FROST = {
  edge: value('noi.eio.world.surface.frost-edge'),
  thickness: value('noi.eio.world.surface.frost-thickness'),
  bends: value('noi.eio.world.surface.frost-ior'),
} as const

/** How long a thing takes to go over from one state to another, in seconds: rising, settling, its fans
 * picking up speed. After that it is exactly where its state says. */
const CHANGE = value('noi.eio.world.states.change')

/** The longest step one picture moves a thing on by, in seconds: after a pause (a page in the background) it
 * goes on from where it was instead of jumping. */
const LONGEST_STEP = 0.1

/** The room glossy things mirror: how large it is, how much it is blurred, and its soft lamps, each so wide, so
 * deep and so bright (in times the world's light) on its place. The places are this file's own: overhead,
 * toward low y and high x (where the sun is), toward low x, and behind. (Till 22 Nov 2026 each x here had the
 * other sign: the user had x turned round, and the lamps stay where they were.) */
const ROOM = {
  size: value('noi.eio.world.room.size'),
  blur: value('noi.eio.world.room.blur'),
  lampThickness: value('noi.eio.world.room.lamp-thickness'),
  lamps: [
    { w: value('noi.eio.world.room.lamp-1-width'), d: value('noi.eio.world.room.lamp-1-depth'), strength: value('noi.eio.world.room.lamp-1-strength'), at: { x: -2, y: -3, z: 18 } },
    { w: value('noi.eio.world.room.lamp-2-width'), d: value('noi.eio.world.room.lamp-2-depth'), strength: value('noi.eio.world.room.lamp-2-strength'), at: { x: 14, y: -12, z: 8 } },
    { w: value('noi.eio.world.room.lamp-3-width'), d: value('noi.eio.world.room.lamp-3-depth'), strength: value('noi.eio.world.room.lamp-3-strength'), at: { x: -17, y: -2, z: 7 } },
    { w: value('noi.eio.world.room.lamp-4-width'), d: value('noi.eio.world.room.lamp-4-depth'), strength: value('noi.eio.world.room.lamp-4-strength'), at: { x: -3, y: 17, z: 9 } },
  ],
  dark: role('noi.eio.color.world.room'),
} as const

// The room a glossy thing mirrors, one for each open world: dark, with soft lamps round it. It is never seen
// itself. Places in it are in the user's x, y, z, as `xyz` turns them.
const rooms = new WeakMap<ThreeWorld, ReturnType<typeof makeRoom>>()
function makeRoom(world: ThreeWorld, colourOf: (token: string) => string) {
  const THREE = world.three
  const room = new THREE.Scene()
  const turned = new THREE.Group()
  turned.quaternion.copy(world.xyz.quaternion)
  turned.scale.copy(world.xyz.scale) // the user's x is turned round: `xyz` carries that as a mirror
  room.add(turned)
  const dark = new THREE.Mesh(new THREE.BoxGeometry(ROOM.size, ROOM.size, ROOM.size), new THREE.MeshBasicNodeMaterial({ color: new THREE.Color(colourOf(ROOM.dark)), side: THREE.BackSide }))
  const white = new THREE.Color(colourOf(LIGHT.colour))
  const lamps = ROOM.lamps.map(lamp => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(lamp.w, lamp.d, ROOM.lampThickness), new THREE.MeshBasicNodeMaterial({ color: white.clone().multiplyScalar(lamp.strength) }))
    m.position.set(lamp.at.x, lamp.at.y, lamp.at.z)
    return m
  })
  // lamps on every side, so each face of a glossy thing has something to mirror
  turned.add(dark, ...lamps)
  const made = new THREE.PMREMGenerator(world.renderer).fromScene(room, ROOM.blur)
  return made.texture
}
function roomFor(world: ThreeWorld, colourOf: (token: string) => string) {
  let room = rooms.get(world)
  if (!room) { room = makeRoom(world, colourOf); rooms.set(world, room) }
  return room
}

/** The parts an element is drawn as, each a shape and a surface as three.js holds them: one part for an element
 * without a border; for one with a border, what lies inside the border, and the border round it. */
function parts(world: ThreeWorld, element: WorldElement, colourOf: (token: string) => string, still = false): Part[] {
  // a thing laid from other elements has no parts of its own: it is those elements, drawn on their places (makeLaid)
  if (element.shape.kind === 'laid') return []
  const THREE = world.three
  const TSL = world.tsl
  const points = (e: WorldElement) => outline(e).map(p => new THREE.Vector2(p.x, p.y))
  // an outline seen from above, raised to the element's thickness: a flat shape of three.js lies in x and y and
  // is raised along z, which inside `xyz` is the ground and up
  const raised = (flat: InstanceType<typeof THREE.Shape>) => new THREE.ExtrudeGeometry(flat, { depth: element.size.z, bevelEnabled: false })
  // a colour of Eidos as three.js holds it, by its token's name, as the page's style has it
  const tint = (token: string) => new THREE.Color(colourOf(token))
  // matte: light is scattered evenly and nothing shines back. `shine` (element.ts, Surface): made to shine
  // all the same, from 0 (not at all) to 1 (as smooth as a glossy surface, and mirroring the room as much)
  const matte = (token: string, shine = 0) => {
    const surface = new THREE.MeshStandardNodeMaterial({ color: tint(token), roughness: 1 - shine * (1 - GLOSS.roughness), metalness: 0 })
    if (shine > 0) {
      surface.envMap = roomFor(world, colourOf)
      surface.envMapIntensity = shine * GLOSS.mirrors
    }
    return surface
  }
  // glossy: its own colour, smooth, under a clear coat that mirrors the room: nothing shows through it
  const glossy = (token: string) => {
    const surface = new THREE.MeshPhysicalNodeMaterial({ color: tint(token), roughness: GLOSS.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: GLOSS.coatRoughness })
    surface.envMap = roomFor(world, colourOf)
    surface.envMapIntensity = GLOSS.mirrors
    return surface
  }
  // lit: its own colour whatever light falls on it
  const lit = (token: string) => new THREE.MeshBasicNodeMaterial({ color: tint(token) })
  // WHAT A STATE LIGHTS A BORDER BY (element.ts, `glow`): how lit the border is, from 0 to 1; whether only
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
    const own = tint(s.colour)
    const surface = new THREE.MeshPhysicalNodeMaterial({ color: own, roughness: s.frost ?? 0, metalness: 0 })
    surface.transmission = 1 - (s.hides ?? 0)
    surface.thickness = FROST.thickness
    surface.ior = FROST.bends
    const sideways = TSL.float(1).sub(TSL.normalLocal.z.mul(TSL.normalLocal.z))
    const edge = TSL.color(own).mul(sideways).mul(FROST.edge)
    if (!as) surface.emissiveNode = edge
    else if (as !== 'inside') {
      const outward = TSL.step(0, TSL.normalLocal.xy.dot(TSL.positionLocal.xy.sub(TSL.vec2(as.middle.x, as.middle.y))))
      surface.emissiveNode = edge.mul(outward).mul(TSL.float(1).sub(as.light.lit)).add(lightOf(as.light))
    }
    return surface
  }
  // a surface as three.js holds it: made once for each surface in the data, so pieces of one surface share it
  const surfaces = new Map<Surface, Material>()
  const surfaceFor = (s: Surface): Material => {
    let made = surfaces.get(s)
    if (!made) {
      made = s.finish === 'frosted' ? frosted(s) : s.finish === 'glossy' ? glossy(s.colour) : s.finish === 'lit' ? lit(s.colour) : matte(s.colour, s.shine ?? 0)
      surfaces.set(s, made)
    }
    return made
  }
  const surfaceOf = (e: WorldElement) => surfaceFor(e.surface)
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
export function makeElement(world: ThreeWorld, element: WorldElement, colourOf: (token: string) => string): Made {
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
  const spinners: Array<{ mesh: Object3D; piece: Piece; spun: number }> = []
  for (const part of made) {
    const mesh = new THREE.Mesh(part.shape, part.surface)
    mesh.name = part.name
    ;(part.partOf ? partNamed(part.partOf) : body).add(mesh)
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
  // WHERE ONE LOOKS OUT OF IT (element.ts, LookOut): a thing with no shape on the eye's place, in the part it
  // turns with, so it goes wherever the element and that part go
  let lookOut: Object3D | undefined
  if (element.lookOut) {
    lookOut = new THREE.Object3D()
    lookOut.name = `${element.id} look-out`
    lookOut.position.set(element.lookOut.at.x, element.lookOut.at.y, element.lookOut.at.z)
    ;(element.lookOut.part ? partNamed(element.lookOut.part) : body).add(lookOut)
  }
  let step: ((seconds: number) => void) | undefined
  // THE STATE IT IS IN (element.ts, ElementState), AND THE PIECES THAT SPIN. The element starts in its first
  // state. Each moment its state says where it should be and what it should be doing (`poseIn`), and there it
  // is, exactly. Only when its state has just changed does it go over smoothly, for CHANGE seconds, from where
  // it was: it rises, it settles, its fans pick up speed and run down. A piece that spins turns about the
  // upright line through its own place, as fast as its own data says times what the state says.
  const states = element.states ?? []
  let state = states[0]
  // THE BORDERS A STATE LIGHTS (element.ts, `glow`): each border that can be lit, how lit it is now (0 to 1),
  // and how lit it was when the state last changed. A state that glows says the colour and the faces of the
  // borders it names; they are set as the thing goes into it, and a border fades as smoothly as the rest.
  const lights = made.flatMap(part => (part.lights ? [{ ...part.lights, is: 0, was: 0, topIs: 0, topWas: 0 }] : []))
  // the colour each of the element's own colours has now: its own to begin with, another while one is tried
  const tried = new Map((element.colours ?? []).map(c => [c.id, c.colour]))
  const lightUp = (s: ElementState | undefined) => {
    if (!s?.glow) return
    const glow = s.glow
    // a part's colour: the one of the element's own colours it names, as that is now; else the glow's
    const colourFor = (named: string | undefined) => colourOf((named ? tried.get(named) : undefined) ?? glow.colour)
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
    step = seconds => {
      const passed = last === null ? 0 : Math.max(0, Math.min(seconds - last, LONGEST_STEP))
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

/** Makes a thing that is laid from other elements (element.ts, Laid): each of those elements is made once and
 * drawn on all its places, as the land's are. It is drawn still and acts out no state. What is placed on it
 * goes into its `body`. */
function makeLaid(world: ThreeWorld, element: WorldElement, shape: Laid, colourOf: (token: string) => string): Made {
  const THREE = world.three
  const thing = new THREE.Group()
  thing.name = element.id
  const body = new THREE.Group()
  body.name = `whole ${element.id}`
  thing.add(body)
  // what is laid on the face below (a bent thing's, bend.ts) is laid turned over, so it is kept apart
  const places = new Map<string, { of: WorldElement; over: boolean; where: Xyz[] }>()
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
  const frame = bend || laidOn ? (p: Xyz) => {
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
export function makeMany(world: ThreeWorld, element: WorldElement, places: readonly Xyz[], colourOf: (token: string) => string, over = false, frame?: (p: Xyz) => InstanceType<typeof THREE_.Matrix4>): Made {
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
