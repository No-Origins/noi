// A small black stage for one element of the 3D world, that you can turn and come closer to. The
// element is drawn with the world's own painters (glsl.ts), so it looks here as it does in the world:
// the same light, the same one rule for the edge of the world. Its numbers and colours come from Eidos.
import { archMeasure, archShape, blockShape, ARCH_MEASURES, type ArchMeasure, type ArchValues } from '../arch/arch.ts'
import { characterLine, CHARACTER_MEASURES, motionFor, type CharacterMeasure, type CharacterValues } from '../character-drawing/character-measures.ts'
import { CharacterPainter, type CharacterFiles } from '../character-drawing/characters.ts'
import { colourOf, dropMesh, mesh, program, type Mesh, type Program } from '../drawing/gl.ts'
import { gatewayShape, GATEWAY_MEASURES, GATEWAY_UNITS, inGateway, opening, rippleFronts, rippleSpacing, type GatewayMeasure, type GatewayValues, type RippleValues } from '../gateway/gateway.ts'
import { FRAG, FRAG_S, VERT, VERT_S } from '../drawing/glsl.ts'
import { firstRow, landMeasure, landValue, LAND_MEASURES, type LandMeasure, type LandValues } from '../land/land.ts'
import { lookAt, mul, perspective, project, type Vec3 } from '../drawing/math.ts'
import { poolMeasure, poolValue, POOL_MEASURES, wallShape, type PoolMeasure, type WallValues } from '../pool/pool.ts'
import { stepsList, stepsMeasure, stepsShape, stepsValue, STEPS_MEASURES, type StepsMeasure, type StepsValues } from '../steps/steps.ts'

// FRAG and FRAG_S both carry the one rule for the edge of the world (EDGE, in glsl.ts) inside them.

/** Where things dissolve: the edge of the world (noi.eio.world.land.radius), how far past it nothing
 * is left (noi.eio.world.edge.band), and one grain of the dust (noi.eio.world.edge.grain). */
export interface EdgeValues { landRadius: number; band: number; grain: number }

/** The colours, as Eidos's colour roles give them for the dark world: what the element is drawn in
 * (noi.eio.color.world.arch), the dark round it (noi.eio.color.world.sky), and what lights up
 * (noi.eio.color.world.highlight). */
export interface StageColours { body: string; sky: string; highlight: string }

export interface ArchScene {
  element: 'arch'
  arch: ArchValues
  edge: EdgeValues
  colours: StageColours
  /** One of the arch's numbers to mark on it, in the highlight colour. */
  measure?: ArchMeasure | null
}

/** The land's colours: the land itself (noi.eio.color.world.land), the dark round it (.sky), its circles
 * (.circle), its dust (.dust) and what lights up (.highlight). */
export interface LandColours { land: string; sky: string; circle: string; dust: string; highlight: string }

export interface LandScene {
  element: 'land'
  land: LandValues
  colours: LandColours
  /** Which page it is for: the land whole, its circles close, or its edge. */
  focus: 'land' | 'circles' | 'edge'
  /** One of its numbers to mark on it, in the highlight colour. */
  measure?: LandMeasure | null
}

/** The pool's colours: the land's, and the wall (noi.eio.color.world.wall), the water (.water) and the
 * water where it is deepest (.water-deep). */
export interface PoolColours extends LandColours { wall: string; water: string; waterDeep: string }

export interface PoolScene {
  element: 'pool'
  /** The land round the pool, painted with it, as in the world. */
  land: LandValues
  wall: WallValues
  colours: PoolColours
  /** Which page it is for: the pool whole, or its wall close. */
  focus: 'pool' | 'wall'
  measure?: PoolMeasure | null
}

/** The steps' colours: the land's (the steps are land), and the line at each step's lip
 * (noi.eio.color.world.step-edge). */
export interface StepsColours extends LandColours { edge: string }

export interface StepsScene {
  element: 'steps'
  steps: StepsValues
  /** The land they rise from, painted with them. */
  land: LandValues
  colours: StepsColours
  measure?: StepsMeasure | null
}

export interface GatewayScene {
  element: 'gateway'
  gateway: GatewayValues
  ripples: RippleValues
  /** The walls are the arch's colour (noi.eio.color.world.arch); the ripples the highlight. */
  colours: StageColours
  /** Which page it is for: the gateway still, or in flight with its lime ripples running. */
  focus: 'gateway' | 'ripples'
  measure?: GatewayMeasure | null
}

export interface CharacterScene {
  element: 'characters'
  /** Which page it is for: the characters themselves, how they move, their flight into a system, the eye. */
  focus: 'character' | 'movement' | 'flight' | 'eye'
  /** Who stands on the stage: all of them on the character's page; the chosen one (Clay, for now) elsewhere. */
  characters: CharacterFiles[]
  values: CharacterValues
  /** The land they stand on, painted with them. */
  land: LandValues
  colours: LandColours
  measure?: CharacterMeasure | null
}

export type Scene = ArchScene | LandScene | PoolScene | StepsScene | GatewayScene | CharacterScene

/** A word over the picture, where a point of the world lands on the screen (CSS pixels). */
export interface Label { text: string; x: number; y: number }
/** A line over the picture, from one point of the world to another as they land on the screen. */
export interface Mark { x1: number; y1: number; x2: number; y2: number }
/** What to lay over the picture after it is drawn. A measure is laid over, not drawn by the card, so
 * that it stays a clear line at any size; it is never hidden by the element it measures. */
export interface Overlay { labels: Label[]; marks: Mark[] }

const SOLID = ['uVP', 'uOff', 'uTurn', 'uEye', 'uVoid', 'uBody', 'uEdgeCol', 'uGlow', 'uTileLine', 'uTileStrong', 'uPocket', 'uFogNear', 'uFogFar',
  'uOn', 'uOver', 'uEdgeW', 'uEdges', 'uTiles', 'uStrongEvery', 'uDeep', 'uGrain', 'uEdge', 'uRound', 'uDots', 'uField', 'uSteps', 'uFlat', 'uDustCol', 'uGate', 'uWave', 'uCircle', 'uWaveBehind']
const GROUND = ['uVP', 'uHalf', 'uEye', 'uLineW', 'uStrongEvery', 'uFogNear', 'uFogFar', 'uLook', 'uTime', 'uPoolOn', 'uGrain', 'uEdge', 'uRound', 'uDots', 'uField', 'uSteps',
  'uDustCol', 'uVoid', 'uTile', 'uTileUp', 'uLine', 'uStrong', 'uGlow', 'uWater', 'uWaterDeep', 'uPool', 'uHover', 'uPicked', 'uHasHover', 'uHasPicked', 'uRefl', 'uView', 'uMirror', 'uCircle']
const FOV = 40 * Math.PI / 180
const FAR = 1e6 // a distance nothing on a stage reaches: no fog, no steps, no pool
const FLIP = [1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] // every height made its opposite: the water's mirror
const HOLD = 0.72 // in flight, past its first stretch a gateway's dust stays this thin (the world page's own)
/** On the lime ripples page, how far into the gateway the character is: past where the ripples start. */
const flyingAt = (r: RippleValues) => r.behind + 20
/** How high he flies in the gateway: through the middle of its opening, as in the world. */
const flyingHeight = (a: ArchValues) => opening(a).height / 2

type View = { yaw: number; pitch: number; dist: number }
type Mirror = { fb: WebGLFramebuffer; tex: WebGLTexture; rb: WebGLRenderbuffer; w: number; h: number }

export class Stage {
  readonly gl: WebGL2RenderingContext
  private solid: Program
  private ground: Program
  private plane: WebGLVertexArrayObject
  private body: Mesh | null = null
  private block: Mesh | null = null
  private mirror: Mirror | null = null
  private scene: Scene | null = null
  private w = 1
  private h = 1
  /** The eye: which way round (radians), how steeply down (radians), how far from what it looks at (metres). */
  view: View = { yaw: 0.55, pitch: 0.2, dist: 150 }
  /** Told by the page: reduced motion is asked for, so what moves by itself keeps its first moment. */
  still = false
  /** Told by the page: something arrived (a character's model) and the picture should be drawn again. */
  onChange: () => void = () => {}
  private chars: CharacterPainter | null = null
  private fitted = ''

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true })
    if (!gl) throw new Error('This browser cannot draw 3D here.')
    this.gl = gl
    this.solid = program(gl, VERT_S, FRAG_S, SOLID)
    this.ground = program(gl, VERT, FRAG, GROUND)
    // the whole ground: one plane, four corners; the painter works out every point of it
    this.plane = gl.createVertexArray()!
    gl.bindVertexArray(this.plane)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer())
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    const at = gl.getAttribLocation(this.ground.p, 'aPos')
    gl.enableVertexAttribArray(at); gl.vertexAttribPointer(at, 2, gl.FLOAT, false, 0, 0)
    gl.enable(gl.DEPTH_TEST)
  }

  set(scene: Scene) {
    const gl = this.gl
    this.scene = scene
    for (const m of [this.body, this.block]) dropMesh(gl, m)
    this.body = this.block = null
    if (scene.element === 'arch') {
      this.body = mesh(gl, archShape(scene.arch))
      this.block = mesh(gl, blockShape(scene.arch, scene.edge.landRadius + scene.edge.band))
    }
    if (scene.element === 'pool') this.body = mesh(gl, wallShape(scene.wall))
    if (scene.element === 'steps') this.body = mesh(gl, stepsShape(scene.steps))
    if (scene.element === 'characters') {
      const v = scene.values, which = scene.measure ?? null, motion = motionFor(which)
      this.chars ??= new CharacterPainter(gl, this.canvas, () => this.onChange())
      void this.chars.show(scene.characters, v.height, v.height * 0.8, motion, scene.colours.sky, scene.colours.circle)
      this.chars.play(motion, motion === 'walk' ? v.walk : motion === 'run' ? v.run : 0)
    }
    if (scene.element === 'gateway') {
      const g = scene.gateway, r = scene.ripples
      // still, its walls are gone at its depth; in flight it goes on as thin dust, further than the ripples reach
      this.body = mesh(gl, gatewayShape(g.arch, scene.focus === 'ripples' ? Math.max(g.depth, flyingAt(r) + r.ahead) * 4 : g.depth))
    }
    // A new element, page or measure puts the eye where it sees the whole of it.
    const key = `${scene.element}:${'focus' in scene ? scene.focus : ''}:${scene.measure ?? ''}`
    if (key !== this.fitted) { this.fitted = key; this.view = startView(scene) }
  }

  /** Whether the element moves by itself (the water's waves), so the page should keep drawing it. */
  moves(): boolean { const s = this.scene; return s?.element === 'pool' || s?.element === 'characters' || (s?.element === 'gateway' && s.focus === 'ripples') }

  /** The picture's size on the page, in CSS pixels, and how many dots of the screen each has. */
  resize(width: number, height: number, dpr: number) {
    this.w = Math.max(1, width); this.h = Math.max(1, height)
    this.canvas.width = Math.round(this.w * dpr); this.canvas.height = Math.round(this.h * dpr)
  }

  turn(dx: number, dy: number) {
    this.view.yaw -= dx * 0.008
    this.view.pitch = Math.min(1.5, Math.max(-0.05, this.view.pitch + dy * 0.006))
  }

  closer(k: number) {
    const s = this.scene
    const most = !s ? 2000 : s.element === 'arch' ? Math.max(s.arch.height, s.arch.width, s.arch.distance) * 6
      : s.element === 'gateway' ? (s.gateway.depth + s.ripples.ahead) * 4
      : s.element === 'characters' ? Math.max(s.values.ceiling, s.values.height * 10) * 3 : (s.land.radius + s.land.band) * 5
    this.view.dist = Math.min(most, Math.max(0.5, this.view.dist * k))
  }

  /** Draws the stage at `seconds` (the water's waves move with time; 0 keeps them still); gives back
   * what to lay over the picture. */
  draw(seconds = 0): Overlay {
    const gl = this.gl, s = this.scene
    if (!s) return { labels: [], marks: [] }
    const t = target(s), v = this.view, cp = Math.cos(v.pitch)
    const e: Vec3 = [t[0] + v.dist * cp * Math.sin(v.yaw), t[1] + v.dist * Math.sin(v.pitch), t[2] + v.dist * cp * Math.cos(v.yaw)]
    const near = Math.max(0.05, v.dist / 200)
    const P = perspective(FOV, this.w / this.h, near, 6000), V = lookAt(e, t), vp = mul(P, V)
    const sky = colourOf(s.colours.sky)

    // The water mirrors what stands round it: drawn first, turned over, into a picture kept on the card.
    const mirrored = s.element === 'pool' && this.drawMirror(s, mul(P, mul(V, FLIP)), [e[0], -e[1], e[2]])

    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true)
    gl.clearColor(sky[0], sky[1], sky[2], 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    if (s.element === 'arch') this.drawArch(s, vp, e)
    else if (s.element === 'land') this.drawGround(s.land, s.colours, vp, e, null, seconds)
    else if (s.element === 'gateway') this.drawGateway(s, vp, e, seconds)
    else if (s.element === 'characters') {
      this.drawGround(s.land, s.colours, vp, e, null, seconds)
      this.chars?.draw(P, V, seconds, this.still)
      this.restore()
    }
    else if (s.element === 'steps') {
      this.drawGround(s.land, s.colours, vp, e, null, seconds, s.steps)
      this.drawSteps(s, vp, e)
    }
    else {
      this.drawGround(s.land, s.colours, vp, e, { scene: s, mirrored }, seconds)
      this.drawWall(s, vp, e)
    }
    return this.overlay(s, vp, seconds)
  }

  /** The painter of solid things, set for one thing: its colour, and the world's rules. */
  private solidFor(vp: Float32Array, e: Vec3, sky: string, body: string, glow: string, edge: EdgeValues) {
    const gl = this.gl, S = this.solid
    gl.useProgram(S.p)
    gl.uniformMatrix4fv(S.u.uVP, false, vp)
    gl.uniform3fv(S.u.uEye, e)
    gl.uniform3fv(S.u.uVoid, colourOf(sky))
    gl.uniform3fv(S.u.uBody, colourOf(body))
    gl.uniform3fv(S.u.uGlow, colourOf(glow))
    gl.uniform3fv(S.u.uOff, [0, 0, 0])
    gl.uniform2f(S.u.uTurn, 1, 0)                                   // facing straight ahead, as it stands in the middle of the five
    gl.uniform1f(S.u.uFogNear, FAR); gl.uniform1f(S.u.uFogFar, FAR * 2) // on its own stage nothing sinks into the dark
    gl.uniform2f(S.u.uEdge, edge.landRadius, edge.landRadius + edge.band)
    gl.uniform1f(S.u.uRound, 1)                                     // the world is round (agreed 17 Nov)
    gl.uniform1f(S.u.uDots, 1)                                      // a grain of dust is a round dot
    gl.uniform1f(S.u.uGrain, edge.grain)
    gl.uniform1f(S.u.uEdges, 0)                                     // solid things have no edge lines (the user, 17 Nov)
    gl.uniform1f(S.u.uTiles, 0); gl.uniform1f(S.u.uFlat, 0); gl.uniform1f(S.u.uDeep, 0)
    gl.uniform1f(S.u.uOn, 0); gl.uniform1f(S.u.uOver, 0)
    gl.uniform4f(S.u.uGate, 0, 0, 1, 0); gl.uniform4f(S.u.uWave, 45, 0, 1, 1)
  }

  private drawArch(s: ArchScene, vp: Float32Array, e: Vec3) {
    const gl = this.gl
    this.solidFor(vp, e, s.colours.sky, s.colours.body, s.colours.highlight, s.edge)
    gl.uniform3f(this.solid.u.uPocket, 0, -1, s.arch.distance)
    for (const m of [this.body, this.block]) if (m) { gl.bindVertexArray(m.vao); gl.drawArrays(gl.TRIANGLES, 0, m.n) }
  }

  private drawWall(s: PoolScene, vp: Float32Array, e: Vec3) {
    const gl = this.gl
    if (!this.body) return
    this.solidFor(vp, e, s.colours.sky, s.colours.wall, s.colours.highlight, { landRadius: s.land.radius, band: s.land.band, grain: s.land.grain })
    gl.bindVertexArray(this.body.vao); gl.drawArrays(gl.TRIANGLES, 0, this.body.n)
  }

  /** The gateway, as the world page paints it: the arch's white, dissolving by depth, not by the edge of
   * the world (it is not on the land). In flight it goes on as thin dust and the lime ripples run. */
  private drawGateway(s: GatewayScene, vp: Float32Array, e: Vec3, seconds: number) {
    const gl = this.gl, S = this.solid, g = s.gateway, r = s.ripples, flying = s.focus === 'ripples'
    if (!this.body) return
    this.solidFor(vp, e, s.colours.sky, s.colours.body, s.colours.highlight, { landRadius: FAR, band: 1, grain: g.grain }) // not on the land
    gl.uniform1f(S.u.uDeep, g.depth)
    gl.uniform3f(S.u.uPocket, 0, -1, g.arch.distance)             // how deep a place is: from the door, along the gateway
    if (flying) {
      gl.uniform4f(S.u.uGate, 1, flyingAt(r), HOLD, 1)
      gl.uniform4f(S.u.uWave, rippleSpacing(r), (r.speed * seconds) % rippleSpacing(r), r.tail, r.ahead)
      gl.uniform1f(S.u.uWaveBehind, r.behind)
    }
    gl.bindVertexArray(this.body.vao); gl.drawArrays(gl.TRIANGLES, 0, this.body.n)
  }

  /** The steps, as the world page paints them: land (they dissolve the land's way), circles on the top
   * step only, and one line at each lip. */
  private drawSteps(s: StepsScene, vp: Float32Array, e: Vec3) {
    const gl = this.gl, S = this.solid, v = s.land, list = stepsList(s.steps)
    if (!this.body) return
    this.solidFor(vp, e, s.colours.sky, s.colours.land, s.colours.highlight, { landRadius: v.radius, band: v.band, grain: v.grain })
    gl.uniform1f(S.u.uFlat, 1)                                      // the steps are land
    gl.uniform1f(S.u.uTiles, 1)                                     // the top step carries the land's circles
    gl.uniform1f(S.u.uEdges, 1)                                     // and each lip its one line, which the shape asks for
    gl.uniform1f(S.u.uEdgeW, 0.06)
    gl.uniform3fv(S.u.uEdgeCol, colourOf(s.colours.edge))
    gl.uniform3fv(S.u.uTileStrong, colourOf(s.colours.circle))
    gl.uniform3fv(S.u.uDustCol, colourOf(s.colours.dust))
    gl.uniform3f(S.u.uField, firstRow(v), v.place / 2, v.circleRadius)
    gl.uniform2f(S.u.uCircle, v.dash, v.line)
    gl.uniform3f(S.u.uSteps, list[0][0], list[list.length - 1][0], 1)
    gl.bindVertexArray(this.body.vao); gl.drawArrays(gl.TRIANGLES, 0, this.body.n)
  }

  /** The water's mirror: the wall drawn once more, turned over, at half size, into a picture on the card. */
  private drawMirror(s: PoolScene, flipped: Float32Array, e: Vec3): boolean {
    const gl = this.gl, m = this.mirrorTarget()
    if (!m) return false
    const sky = colourOf(s.colours.sky)
    gl.bindFramebuffer(gl.FRAMEBUFFER, m.fb); gl.viewport(0, 0, m.w, m.h)
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true)
    gl.clearColor(sky[0], sky[1], sky[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)
    this.drawWall(s, flipped, e)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return true
  }

  private mirrorTarget(): Mirror | null {
    const gl = this.gl, w = Math.max(2, this.canvas.width >> 1), h = Math.max(2, this.canvas.height >> 1)
    if (this.mirror && this.mirror.w === w && this.mirror.h === h) return this.mirror
    if (this.mirror) { gl.deleteFramebuffer(this.mirror.fb); gl.deleteTexture(this.mirror.tex); gl.deleteRenderbuffer(this.mirror.rb); this.mirror = null }
    const tex = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const rb = gl.createRenderbuffer()!
    gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h)
    const fb = gl.createFramebuffer()!
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, rb)
    const good = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    if (!good) { gl.deleteFramebuffer(fb); gl.deleteTexture(tex); gl.deleteRenderbuffer(rb); return null }
    this.mirror = { fb, tex, rb, w, h }
    return this.mirror
  }

  /** The ground painter: the land, its circles, its edge; and, for the pool, the water painted on it. */
  private drawGround(v: LandValues, c: LandColours, vp: Float32Array, e: Vec3, pool: { scene: PoolScene; mirrored: boolean } | null, seconds: number, steps?: StepsValues) {
    const gl = this.gl, G = this.ground
    gl.useProgram(G.p)
    gl.uniformMatrix4fv(G.u.uVP, false, vp)
    gl.uniform3fv(G.u.uEye, e)
    gl.uniform1f(G.u.uHalf, v.radius + v.band + v.place)            // the plane reaches past where nothing is left
    gl.uniform2f(G.u.uEdge, v.radius, v.radius + v.band)
    gl.uniform1f(G.u.uRound, 1)                                     // the world is round (agreed 17 Nov)
    gl.uniform1f(G.u.uDots, 1)
    gl.uniform1f(G.u.uGrain, v.grain)
    gl.uniform3f(G.u.uField, firstRow(v), v.place / 2, v.circleRadius)
    gl.uniform2f(G.u.uCircle, v.dash, v.line)
    // where the steps begin and where the top one begins: no circle on the ground is cut by them;
    // alone, the land has no steps on it, and its circles go all round
    if (steps) { const list = stepsList(steps); gl.uniform3f(G.u.uSteps, list[0][0], list[list.length - 1][0], 0) }
    else gl.uniform3f(G.u.uSteps, FAR, FAR, 0)
    gl.uniform1f(G.u.uPoolOn, 0); gl.uniform1f(G.u.uLook, 0)
    gl.uniform1f(G.u.uHasHover, 0); gl.uniform1f(G.u.uHasPicked, 0)
    gl.uniform1f(G.u.uFogNear, FAR); gl.uniform1f(G.u.uFogFar, FAR * 2)
    gl.uniform2f(G.u.uView, this.canvas.width, this.canvas.height)
    gl.uniform3fv(G.u.uVoid, colourOf(c.sky))
    gl.uniform3fv(G.u.uTile, colourOf(c.land))
    gl.uniform3fv(G.u.uStrong, colourOf(c.circle))
    gl.uniform3fv(G.u.uDustCol, colourOf(c.dust))
    gl.uniform3fv(G.u.uGlow, colourOf(c.highlight))
    if (pool) {
      const pc = pool.scene.colours
      gl.uniform3f(G.u.uPool, 0, 0, pool.scene.wall.poolRadius)
      gl.uniform3fv(G.u.uWater, colourOf(pc.water))
      gl.uniform3fv(G.u.uWaterDeep, colourOf(pc.waterDeep))
      gl.uniform1f(G.u.uTime, seconds)
      gl.uniform1f(G.u.uMirror, pool.mirrored ? 1 : 0)
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, pool.mirrored && this.mirror ? this.mirror.tex : null)
      gl.uniform1i(G.u.uRefl, 0)
    } else {
      gl.uniform3f(G.u.uPool, 0, 0, -FAR)                           // no water: the pool is its own element
      gl.uniform1f(G.u.uMirror, 0); gl.uniform1f(G.u.uTime, 0)
    }
    gl.bindVertexArray(this.plane)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private overlay(s: Scene, vp: Float32Array, seconds: number): Overlay {
    const over: Overlay = { labels: [], marks: [] }
    if (s.element === 'gateway') return this.gatewayOverlay(s, vp, seconds)
    if (s.element === 'characters') return this.characterOverlay(s, vp)
    if (!s.measure) return over
    const m = s.element === 'arch' ? archMeasure(s.arch, s.measure) : s.element === 'land' ? landMeasure(s.land, s.measure)
      : s.element === 'pool' ? poolMeasure(s.wall, s.measure) : stepsMeasure(s.steps, s.measure)
    const value = s.element === 'arch' ? s.arch[s.measure] : s.element === 'land' ? landValue(s.land, s.measure)
      : s.element === 'pool' ? poolValue(s.wall, s.measure) : stepsValue(s.steps, s.measure)
    const name = s.element === 'arch' ? ARCH_MEASURES[s.measure] : s.element === 'land' ? LAND_MEASURES[s.measure]
      : s.element === 'pool' ? POOL_MEASURES[s.measure] : STEPS_MEASURES[s.measure]
    const len = Math.hypot(m.to[0] - m.from[0], m.to[1] - m.from[1], m.to[2] - m.from[2])
    const tick = Math.min(4, len * 0.08) // a tick across each end, in step with the measure, never longer than 8 metres in all
    const at = (p: Vec3) => project(vp, p, this.w, this.h)
    const line = (a: Vec3, b: Vec3) => { const p = at(a), q = at(b); if (p && q) over.marks.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1] }) }
    const off = (p: Vec3, k: number): Vec3 => [p[0] + m.tick[0] * k, p[1] + m.tick[1] * k, p[2] + m.tick[2] * k]
    line(m.from, m.to)
    for (const p of [m.from, m.to]) line(off(p, -tick), off(p, tick))
    // the words sit over the middle of the measure, just above its higher end, so they never cover it
    const mid = at([(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2, (m.from[2] + m.to[2]) / 2]), a = at(m.from), b = at(m.to)
    if (mid) over.labels.push({ text: `${name} · ${plain(value)} m`, x: mid[0], y: Math.min(mid[1], a?.[1] ?? mid[1], b?.[1] ?? mid[1]) })
    if (s.element === 'arch' && s.measure === 'distance') {
      line([-tick, 0, 0], [tick, 0, 0]); line([0, 0, -tick], [0, 0, tick])
      const pool = at([0, 0, 0])
      if (pool) over.labels.push({ text: 'The pool’s middle', x: pool[0], y: pool[1] })
    }
    if ((s.element === 'land' && s.measure === 'radius') || (s.element === 'pool' && s.measure === 'pool-radius') || (s.element === 'steps' && s.measure === 'start')) {
      const pool = at([0, 0, 0])
      if (pool) over.labels.push({ text: 'The middle', x: pool[0], y: pool[1] })
    }
    return over
  }

  /** The gateway's measures: its depth along its floor; and, in flight, where the character is, how far
   * behind him the ripples start and ahead of him they fade, and the tail of the next ripple ahead. */
  private gatewayOverlay(s: GatewayScene, vp: Float32Array, seconds: number): Overlay {
    const over: Overlay = { labels: [], marks: [] }, a = s.gateway.arch, r = s.ripples, D = flyingAt(r)
    // the gateway's depth lies along its floor; the ripples' measures run along a little below his height
    const floor = s.focus === 'gateway' ? 0.05 : flyingHeight(a) - 3
    const at = (p: Vec3) => project(vp, p, this.w, this.h)
    const line = (p: Vec3, q: Vec3) => { const u = at(p), v = at(q); if (u && v) over.marks.push({ x1: u[0], y1: u[1], x2: v[0], y2: v[1] }) }
    const say = (text: string, p: Vec3) => { const u = at(p); if (u) over.labels.push({ text, x: u[0], y: u[1] }) }
    const along = (d0: number, d1: number) => { line(inGateway(a, d0, floor), inGateway(a, d1, floor)); for (const d of [d0, d1]) line([-1.5, floor, -(a.distance + d)], [1.5, floor, -(a.distance + d)]) }
    const m = s.measure, words = m ? `${GATEWAY_MEASURES[m]} · ${plain(m === 'depth' ? s.gateway.depth : r[m])} ${GATEWAY_UNITS[m]}` : ''
    if (s.focus === 'gateway') {
      if (m === 'depth') { along(0, s.gateway.depth); say(words, inGateway(a, s.gateway.depth / 2, floor)) }
      return over
    }
    say('Where the character flies', inGateway(a, D, flyingHeight(a)))
    const next = rippleFronts(r, (r.speed * seconds) % rippleSpacing(r)).filter(f => f > 0)[0]
    if (m === 'behind') { along(D - r.behind, D); say(words, inGateway(a, D - r.behind / 2, floor)) }
    if (m === 'ahead') { along(D, D + r.ahead); say(words, inGateway(a, D + r.ahead / 2, floor)) }
    if (m === 'tail' && next !== undefined) { along(D + next - r.tail, D + next); say(words, inGateway(a, D + next - r.tail / 2, floor)) }
    if ((m === 'gap' || m === 'speed') && next !== undefined) say(words, inGateway(a, D + next, floor))
    return over
  }

  /** A character's measure: a line for a length; words over his head for a speed or a time. And why
   * nothing stands there, if the characters could not be drawn. */
  private characterOverlay(s: CharacterScene, vp: Float32Array): Overlay {
    const over: Overlay = { labels: [], marks: [] }, v = s.values
    if (this.chars?.why) over.labels.push({ text: this.chars.why, x: this.w / 2, y: this.h / 2 })
    if (!this.chars?.ready && !this.chars?.why) over.labels.push({ text: 'Bringing the characters…', x: this.w / 2, y: this.h / 2 })
    if (!s.measure) return over
    const m = CHARACTER_MEASURES[s.measure], words = `${m.name} · ${plain(v[s.measure])} ${m.unit}`, line = characterLine(v, s.measure)
    const at = (p: Vec3) => project(vp, p, this.w, this.h)
    if (!line) { const u = at([0, v.height * 1.15, 0]); if (u) over.labels.push({ text: words, x: u[0], y: u[1] }); return over }
    const len = Math.hypot(line.to[0] - line.from[0], line.to[1] - line.from[1], line.to[2] - line.from[2]), tick = Math.min(4, len * 0.08)
    const seg = (a: Vec3, b: Vec3) => { const p = at(a), q = at(b); if (p && q) over.marks.push({ x1: p[0], y1: p[1], x2: q[0], y2: q[1] }) }
    const off = (p: Vec3, k: number): Vec3 => [p[0] + line.tick[0] * k, p[1] + line.tick[1] * k, p[2] + line.tick[2] * k]
    seg(line.from, line.to)
    for (const p of [line.from, line.to]) seg(off(p, -tick), off(p, tick))
    const mid = at([(line.from[0] + line.to[0]) / 2, (line.from[1] + line.to[1]) / 2, (line.from[2] + line.to[2]) / 2]), a = at(line.from), b = at(line.to)
    if (mid) over.labels.push({ text: words, x: mid[0], y: Math.min(mid[1], a?.[1] ?? mid[1], b?.[1] ?? mid[1]) })
    if (m.group === 'eye') { const eye = at(line.to); if (eye) over.labels.push({ text: 'The eye', x: eye[0], y: eye[1] }) }
    return over
  }

  /** After three.js has drawn, the card is put back the way this stage's own painters expect it (the world
   * page's own way of sharing one picture with three.js). */
  private restore() {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, this.canvas.width, this.canvas.height)
    gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.disable(gl.STENCIL_TEST); gl.disable(gl.SCISSOR_TEST); gl.disable(gl.POLYGON_OFFSET_FILL)
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LESS); gl.depthMask(true); gl.depthRange(0, 1)
    gl.colorMask(true, true, true, true); gl.frontFace(gl.CCW)
    gl.activeTexture(gl.TEXTURE0); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  }

  destroy() {
    const gl = this.gl
    this.chars?.destroy()
    for (const m of [this.body, this.block]) dropMesh(gl, m)
    if (this.mirror) { gl.deleteFramebuffer(this.mirror.fb); gl.deleteTexture(this.mirror.tex); gl.deleteRenderbuffer(this.mirror.rb) }
    gl.deleteVertexArray(this.plane)
    gl.deleteProgram(this.solid.p); gl.deleteProgram(this.ground.p)
  }
}

/** What the eye looks at. */
function target(s: Scene): Vec3 {
  if (s.element === 'arch') {
    const a = s.arch
    if (s.measure === 'distance') return [0, a.height * 0.25, -a.distance / 2]
    return [0, a.height * 0.45, -(a.distance - a.reach / 2)]
  }
  if (s.element === 'characters') {
    const v = s.values, line = s.measure ? characterLine(v, s.measure) : null
    if (line) return [(line.from[0] + line.to[0]) / 2, Math.max(v.height / 2, (line.from[1] + line.to[1]) / 2), (line.from[2] + line.to[2]) / 2]
    return [0, v.height * 0.55, 0]
  }
  if (s.element === 'gateway') {
    const a = s.gateway.arch, g = s.gateway, r = s.ripples, h = flyingHeight(a)
    if (s.focus === 'gateway') return inGateway(a, g.depth / 3, opening(a).height * 0.4)
    const D = flyingAt(r)
    if (s.measure === 'behind') return inGateway(a, D - r.behind / 2, h)
    if (s.measure === 'ahead') return inGateway(a, D + r.ahead / 2, h)
    return inGateway(a, D + 24, h)                                // as the eye in a gateway looks: 24 metres past him
  }
  if (s.element === 'steps') {
    const v = s.steps, list = stepsList(v)
    if (s.measure) { const m = stepsMeasure(v, s.measure); return [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2, (m.from[2] + m.to[2]) / 2] }
    return [0, v.top * 0.4, -(v.start + list[list.length - 1][0]) / 2]
  }
  if (s.element === 'pool') {
    const w = s.wall
    if (s.measure) { const m = poolMeasure(w, s.measure); return [(m.from[0] + m.to[0]) / 2, (m.from[1] + m.to[1]) / 2, (m.from[2] + m.to[2]) / 2] }
    return s.focus === 'wall' ? [0, w.height / 2, w.poolRadius + w.width / 2] : [0, 0, 0]
  }
  const v = s.land
  if (s.measure) { const m = landMeasure(v, s.measure); return [(m.from[0] + m.to[0]) / 2, 0, (m.from[2] + m.to[2]) / 2] }
  if (s.focus === 'circles') return [0, 0, firstRow(v) + v.place]
  if (s.focus === 'edge') return [0, 0, v.radius + v.band / 2]
  return [0, 0, 0]
}

/** Where the eye starts: far enough to see the whole of what the page is about. */
function startView(s: Scene): View {
  if (s.element === 'arch') {
    const a = s.arch
    return s.measure === 'distance' ? { yaw: 0.9, pitch: 0.5, dist: a.distance * 1.5 } : { yaw: 0.55, pitch: 0.2, dist: Math.max(a.height, a.width) * 2.1 }
  }
  if (s.element === 'characters') {
    const v = s.values, line = s.measure ? characterLine(v, s.measure) : null
    if (line && CHARACTER_MEASURES[s.measure!].group === 'eye') { const d = Math.abs(line.to[2]); return { yaw: Math.PI / 2, pitch: 0.25, dist: Math.max(6, d * 1.7) } }
    if (line) { const h = Math.max(line.to[1], v.height); return { yaw: 0.4, pitch: 0.12, dist: Math.max(v.height * 3, h * 2.4) } }
    return { yaw: 0.3, pitch: 0.1, dist: v.height * (s.characters.length > 1 ? 3.4 : 2.6) }
  }
  if (s.element === 'gateway') {
    const g = s.gateway, r = s.ripples, toward = 0, back = Math.PI // looking in from the door; looking back toward it
    if (s.focus === 'gateway') return { yaw: toward, pitch: 0.05, dist: g.depth * 0.45 }
    if (s.measure === 'behind') return { yaw: back, pitch: 0.05, dist: r.behind * 1.1 }
    if (s.measure === 'ahead') return { yaw: toward, pitch: 0.05, dist: r.ahead * 0.62 }
    return { yaw: toward, pitch: 0.0125, dist: 27.4 }               // as the eye in a gateway: 3.4 metres behind him, a little above
  }
  if (s.element === 'steps') {
    const v = s.steps, run = stepsList(v).slice(-1)[0][0] - v.start
    switch (s.measure) {
      case 'start': return { yaw: 0.5, pitch: 0.75, dist: v.start * 2.4 }
      case 'depth': case 'height': return { yaw: 0.9, pitch: 0.3, dist: Math.max(4, (v.depth + v.height) * 4) }
      case 'top': return { yaw: 0.9, pitch: 0.22, dist: Math.max(20, v.top * 4) }
      default: return { yaw: 0.45, pitch: 0.42, dist: Math.max(40, run * 2.2) }
    }
  }
  if (s.element === 'pool') {
    const w = s.wall
    switch (s.measure ?? s.focus) {
      case 'pool': case 'pool-radius': return { yaw: 0.3, pitch: 0.42, dist: w.poolRadius * 3.2 }
      default: return { yaw: 0.5, pitch: 0.3, dist: Math.max(4, (w.height + w.width) * 4) }
    }
  }
  const v = s.land, edgeward = Math.PI // looking out, from inside the land toward its edge
  switch (s.measure ?? s.focus) {
    case 'land': case 'radius': return { yaw: 0.3, pitch: 0.8, dist: (v.radius + v.band) * 2.4 }
    case 'edge': case 'band': return { yaw: edgeward, pitch: 0.42, dist: v.band * 2.6 }
    case 'grain': return { yaw: edgeward, pitch: 1.1, dist: Math.max(v.grain * 18, 3) }
    case 'circles': case 'place': return { yaw: 0.3, pitch: 0.95, dist: v.place * 4.5 }
    case 'circle-radius': case 'dash': return { yaw: 0.3, pitch: 1.2, dist: v.circleRadius * 4 }
    case 'line': return { yaw: 0.3, pitch: 1.3, dist: Math.max(v.line * 30, 2) }
  }
  return { yaw: 0.3, pitch: 0.8, dist: (v.radius + v.band) * 2.4 }
}

const plain = (x: number) => x.toLocaleString('en-GB', { maximumFractionDigits: 2 })
