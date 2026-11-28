// THE SUPER SNAIL, DRAWN (27 Nov 2026): what snail.ts says, made by three.js and put on a strip of the world.
// A CONCEPT, NOT AN ELEMENT (snail.ts): so its shapes are made here, on its own page, and nothing of it is in
// @noi/eio-3d. Where Eidos already has the shape, Eidos's own drawing makes it: the fans in its engines and the
// emblems on its shell are Eidos's astroid, and the engines' intakes Eidos's ring (makeElement), as the drone's are.
//
// WHAT IT IS MADE OF, all MY DESIGN:
//   its body, one soft shape from the tip of its tail to its head, its neck raised; it ripples as it crawls,
//     stretches as it gains speed and tucks its head down as it boosts;
//   two eyes on stalks, each under a brow in the secondary colour, its mask; the stalks sweep back with its speed;
//   a scarf in the secondary colour round its neck, its two tails streaming behind;
//   its shell, a spiral in the secondary colour with a rim that glows in the primary colour: a flywheel on an axle
//     over its back, which turns as snail.ts says;
//   a saddle and two engines beside it, the booster: each takes air through a ring in which a fan turns with the
//     shell, and burns as much as the boost says, a flame of the primary colour inside one of the secondary;
//   a trail of the primary colour on the platform behind it, brighter where it boosted.
// Every colour is a role of Eidos, read from the page's style. Every number here is this drawing's own.
//
// IT STANDS IN THE STRIP'S OWN ACROSS, ALONG AND UP where it is (rideAlong.ts, Strip), so it goes over the wave and
// round the twist with the platform under its foot. THE LIGHT GOES WITH IT: the world's own light (@noi/eio-3d,
// LIGHT), but said in the strip's ways where the snail is, so it is lit the same wherever the strip has turned to.
// THE EYE goes with it too, in one of three shots (snail.ts, SHOTS), gliding from one to the next.
import type { BufferGeometry, Material, Mesh, Object3D } from 'three/webgpu'
import { BASE_TILE, LIGHT, makeElement, role, type Frame, type Made, type RolePath, type WorldElement, type Xyz } from '@noi/eio-3d'
import { at, toThree } from '../place.ts'
import type { Strip } from '../rideAlong.ts'
import type { World } from '../world.ts'
import { BODY, FASTEST, FASTEST_WIND_UP, SHOTS, shotFor, spinShare, type ShotName, type Snail } from './snail.ts'

export interface DrawnSnail {
  /** Shows the snail as it is, `seconds` into the picture's own time, `passed` seconds after the last picture. */
  show(snail: Snail, seconds: number, passed: number): void
  /** The shot the eye is taking now. */
  readonly shot: ShotName
  /** Forgets its trail and where the eye was gliding from: the snail was put somewhere else. */
  jumped(): void
  gone(): void
}

/** Where the sun stands from the snail, in the strip's across, along and up: above, before it and to its right,
 * so its face is lit in every shot. MY PICK (the world's own sun stands still: LIGHT.sunFrom). */
const SUN = { across: 7, along: 5, up: 15 } as const

/** How the body is made: so many rings from tail to head, each of so many places round. */
const RINGS = 60
const ROUND = 20
/** How the shell's spiral is made: so many turns, of so many rings, each of so many places round; `tube`: how
 * far its whorl reaches either side of its middle line, as a share of how far out that line is. */
const SPIRAL = { turns: 2.75, rings: 170, round: 12, tube: 0.33, closes: 0.92 } as const
/** The engines: where each is from the middle of the foot (across either way, along, up), how long and how wide. */
const ENGINE = { across: 1.34, along: -1.05, up: 0.84, long: 1.7, radius: 0.33, nozzle: 0.45, fan: 0.25 } as const
/** The flame of one engine at full boost: three cones, one inside the other, each so long and so wide. */
const FLAME = { outer: { long: 6, radius: 0.36, strong: 0.6 }, inner: { long: 3.6, radius: 0.2, strong: 0.8 }, core: { long: 1.3, radius: 0.1, strong: 0.7 } } as const
/** The trail: a place kept every so many metres, so many of them, so wide at the snail. */
const TRAIL = { every: 1.5, places: 110, wide: 1.1, above: 0.03, faint: 0.1, bright: 0.55 } as const
/** The scarf's two tails: how long, how wide, of how many parts. */
const TAIL = { long: 1.7, wide: 0.3, parts: 12 } as const
/** How long the eye takes to go most of the way from one shot to the next, in seconds. */
const EYE_GLIDES = 0.6

const smooth = (low: number, high: number, n: number) => {
  const t = Math.min(Math.max((n - low) / (high - low), 0), 1)
  return t * t * (3 - 2 * t)
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t

/** Draws the snail into `world`, on `strip`. `colourOf` gives a colour of Eidos by its token's name, as the
 * page's style has it. */
export function drawSnail(world: World, strip: Strip, colourOf: (token: string) => string): DrawnSnail {
  const THREE = world.three
  const camera = world.camera
  if (!('fov' in camera)) throw new Error('The snail is looked at by an eye that sees in perspective.')
  const tint = (path: RolePath) => new THREE.Color(colourOf(role(path)))
  const kept: Array<{ dispose(): void }> = []
  const keep = <T extends { dispose(): void }>(thing: T): T => { kept.push(thing); return thing }
  const made: Made[] = []

  // ——— its surfaces ———
  const WHITE = tint('noi.eio.color.world.wall')
  const PRIMARY = tint('noi.eio.color.action.primary')
  const SECONDARY = tint('noi.eio.color.action.secondary')
  const BLACK = tint('noi.eio.color.world.land')
  const GREY = tint('noi.eio.color.world.step-edge')
  const skin = keep(new THREE.MeshStandardNodeMaterial({ color: WHITE, roughness: 0.62, metalness: 0 }))
  const cloth = keep(new THREE.MeshStandardNodeMaterial({ color: SECONDARY, roughness: 0.85, metalness: 0, side: THREE.DoubleSide }))
  const shellLook = keep(new THREE.MeshPhysicalNodeMaterial({ color: SECONDARY, roughness: 0.32, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.2 }))
  const rimLook = keep(new THREE.MeshStandardNodeMaterial({ color: PRIMARY, roughness: 0.5, metalness: 0, emissive: PRIMARY, emissiveIntensity: 0.2 }))
  const metal = keep(new THREE.MeshStandardNodeMaterial({ color: GREY, roughness: 0.45, metalness: 0.35 }))
  const pupilLook = keep(new THREE.MeshPhysicalNodeMaterial({ color: BLACK, roughness: 0.15, metalness: 0, clearcoat: 1 }))
  /** A light of its own colour, added to what is behind it: a flame, a glow, the trail. */
  const glowing = (colour: InstanceType<typeof THREE.Color>, strong = 1) => keep(new THREE.MeshBasicNodeMaterial({ color: colour, opacity: strong, vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }))

  // ——— where it stands: the strip's ways, with the top of the tiles as its ground ———
  const rig = new THREE.Group()
  rig.name = 'super snail'
  rig.matrixAutoUpdate = false
  world.xyz.add(rig)
  const GROUND = BASE_TILE.size.z
  const onStrip = (f: Frame, across: number, along: number, up: number): Xyz => ({
    x: f.at.x + f.across.x * across + f.along.x * along + f.up.x * (up + GROUND),
    y: f.at.y + f.across.y * across + f.along.y * along + f.up.y * (up + GROUND),
    z: f.at.z + f.across.z * across + f.along.z * along + f.up.z * (up + GROUND),
  })
  // what leans back as it launches: all of it but the trail
  const whole = new THREE.Group()
  rig.add(whole)
  const add = (to: Object3D, shape: BufferGeometry, surface: Material, name: string): Mesh => {
    const mesh = new THREE.Mesh(keep(shape), surface)
    mesh.name = name
    to.add(mesh)
    return mesh
  }

  // ——— a shape swept along a line: rings of places, closed at both ends ———
  /** A skin over `rings` rings of `round` places each. `put` sets where each place is; then its faces' ways are
   * worked out afresh. */
  const swept = (rings: number, round: number) => {
    const places = new Float32Array(rings * round * 3)
    const shape = new THREE.BufferGeometry()
    shape.setAttribute('position', new THREE.BufferAttribute(places, 3))
    const faces: number[] = []
    for (let i = 0; i < rings - 1; i++) for (let j = 0; j < round; j++) {
      const [a, b, c, d] = [i * round + j, (i + 1) * round + j, (i + 1) * round + ((j + 1) % round), i * round + ((j + 1) % round)]
      faces.push(a, d, b, b, d, c)
    }
    shape.setIndex(faces)
    return {
      shape,
      /** `ring`: for ring i, its middle (y, z), its way there (ty, tz, one long), and how far it reaches to a
       * side, above its middle and below it. Its places lie in x and in the line square to its way. */
      put(ring: (i: number) => { y: number; z: number; ty: number; tz: number; side: number; above: number; below: number }) {
        for (let i = 0; i < rings; i++) {
          const r = ring(i)
          for (let j = 0; j < round; j++) {
            const a = (2 * Math.PI * j) / round
            const [c, s] = [Math.cos(a), Math.sin(a)]
            const out = s >= 0 ? r.above * s : r.below * s
            const k = (i * round + j) * 3
            places[k] = 0 - r.side * c
            places[k + 1] = r.y - r.tz * out
            places[k + 2] = r.z + r.ty * out
          }
        }
        shape.attributes.position!.needsUpdate = true
        shape.computeVertexNormals()
        shape.computeBoundingSphere()
      },
    }
  }

  // ——— its body ———
  /** The body's line and girth at t, from the tip of its tail (0) to the front of its head (1). `long`: how long
   * the body is now; `rise`: how high it carries its head now; `ripple`: how strongly its foot ripples; `beat`:
   * where the ripple is. */
  const bodyAt = (t: number, long: number, rise: number, ripple: number, beat: number) => {
    const half = BODY.wide / 2
    // how far it reaches to a side: its tail tapers, its foot is full, its neck narrows, its head is a little fuller
    const tail = Math.sin((Math.PI / 2) * Math.min(t / 0.3, 1)) ** 0.8
    const neck = mix(1, 0.6, smooth(0.54, 0.74, t))
    const head = mix(1, 1.22, smooth(0.76, 0.88, t))
    const nose = t > 0.9 ? Math.sqrt(Math.max(0, 1 - ((t - 0.9) / 0.1) ** 2)) : 1
    const waves = 1 + ripple * 0.06 * Math.sin(2 * Math.PI * (2.6 * t - beat)) * (1 - smooth(0.5, 0.7, t))
    const full = half * tail * neck * head * waves
    const side = full * nose
    // its foot is flat underneath and its neck is round
    const round = smooth(0.5, 0.76, t)
    const above = mix((BODY.tall - 0.22) * tail, full, round) * nose
    const below = mix(0.22 * tail, full, round) * nose
    const lift = rise * smooth(0.54, 0.88, t)
    // its middle line does not drop where its head is rounded off: the head is round, not hooked
    return { y: (t - 0.5) * long, z: mix(0.22 * tail, full, round) + lift, side, above, below }
  }
  const body = swept(RINGS, ROUND)
  add(whole, body.shape, skin, 'body')
  /** How the body is now: how long, how high its head, how strongly it ripples and where the ripple is. */
  let now = { long: BODY.long as number, rise: BODY.headUp - 0.5, ripple: 1, beat: 0 }
  /** The body's line at t as it is now, with its way there (one long). */
  const lineAt = (t: number) => {
    const at = (u: number) => bodyAt(Math.min(Math.max(u, 0), 1), now.long, now.rise, now.ripple, now.beat)
    const [here, before, after] = [at(t), at(t - 0.01), at(t + 0.01)]
    const [dy, dz] = [after.y - before.y, after.z - before.z]
    const far = Math.hypot(dy, dz) || 1
    return { ...here, ty: dy / far, tz: dz / far }
  }
  // its rings stand closer together toward its two ends, where it is rounded off
  const shapeBody = () => body.put(i => lineAt(0.5 - 0.5 * Math.cos((Math.PI * i) / (RINGS - 1))))
  /** A place on the body's line by its share of the way from tail to head, and how the body is turned there. */
  const onBody = (t: number) => {
    const p = lineAt(t)
    return { y: p.y, z: p.z, pitch: Math.atan2(p.tz, p.ty), girth: p.side }
  }

  // ——— its head: two eyes on stalks, each under a brow; its two short feelers, as bumps low on its face ———
  const head = new THREE.Group()
  whole.add(head)
  const STALK = { long: 0.95, eye: 0.24 } as const
  const stalkShape = new THREE.CylinderGeometry(0.06, 0.11, STALK.long, 10)
  stalkShape.rotateX(Math.PI / 2).translate(0, 0, STALK.long / 2)
  const eyeShape = new THREE.SphereGeometry(STALK.eye, 20, 14)
  const pupilShape = new THREE.SphereGeometry(STALK.eye * 0.5, 14, 10)
  const browShape = new THREE.SphereGeometry(STALK.eye * 1.08, 20, 8, 0, 2 * Math.PI, 0, 0.36 * Math.PI)
  browShape.rotateX(Math.PI / 2)
  const feelerShape = new THREE.SphereGeometry(0.085, 12, 8)
  for (const shape of [stalkShape, eyeShape, pupilShape, browShape, feelerShape]) keep(shape)
  const stalks = ([-1, 1] as const).map(hand => {
    const stalk = new THREE.Group()
    stalk.position.set(hand * 0.22, 0.1, 0.36)
    head.add(stalk)
    stalk.add(new THREE.Mesh(stalkShape, skin))
    const eye = new THREE.Mesh(eyeShape, skin)
    eye.position.set(0, 0, STALK.long + STALK.eye * 0.55)
    stalk.add(eye)
    const pupil = new THREE.Mesh(pupilShape, pupilLook)
    pupil.position.set(0 - hand * 0.03, STALK.eye * 0.68, 0 - STALK.eye * 0.05)
    eye.add(pupil)
    // its brow: a cap in the secondary colour, tipped forward and inward over the eye: the mask of a hero
    const brow = new THREE.Mesh(browShape, cloth)
    brow.rotation.set(-0.3, hand * 0.42, 0)
    eye.add(brow)
    const feeler = new THREE.Mesh(feelerShape, skin)
    feeler.position.set(hand * 0.31, 0.38, -0.16)
    head.add(feeler)
    return { stalk, eye, hand }
  })

  // its smirk: a dark line low on its face, higher at one end
  const smirkShape = new THREE.TorusGeometry(0.19, 0.034, 6, 18, Math.PI * 0.7)
  smirkShape.rotateZ(Math.PI * 0.15 + 0.2)
  const smirk = add(head, smirkShape, pupilLook, 'smirk')
  // it lies on the front of the head and faces the way the head's skin faces there
  const faces = new THREE.Vector3(0, 1, -0.06).normalize()
  smirk.position.set(0.02, 0.52, -0.03).addScaledVector(faces, -0.035)
  smirk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), faces)

  // ——— its scarf: a band round its neck, and two tails that stream behind ———
  const scarf = new THREE.Group()
  whole.add(scarf)
  const bandShape = new THREE.TorusGeometry(1, 0.2, 10, 28)
  bandShape.rotateX(Math.PI / 2)
  const band = add(scarf, bandShape, cloth, 'scarf')
  const tails = ([-1, 1] as const).map(hand => {
    const places = new Float32Array((TAIL.parts + 1) * 2 * 3)
    const shape = keep(new THREE.BufferGeometry())
    shape.setAttribute('position', new THREE.BufferAttribute(places, 3))
    const faces: number[] = []
    for (let k = 0; k < TAIL.parts; k++) faces.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2)
    shape.setIndex(faces)
    const mesh = new THREE.Mesh(shape, cloth)
    mesh.name = 'scarf tail'
    mesh.frustumCulled = false
    whole.add(mesh)
    return { hand, places, shape }
  })

  // ——— its shell: a spiral on an axle over its back, which turns ———
  const AXLE = { along: -0.45, up: BODY.tall + BODY.shell - BODY.sunk } as const
  const mount = new THREE.Group()
  mount.position.set(0, AXLE.along, AXLE.up)
  whole.add(mount)
  const shell = new THREE.Group()
  mount.add(shell)
  const far = SPIRAL.turns * 2 * Math.PI
  // each turn is so much larger than the one inside it that their whorls just close on each other
  const grows = (Math.log((1 + SPIRAL.tube) / (1 - SPIRAL.tube)) / (2 * Math.PI)) * SPIRAL.closes
  const outAtEnd = BODY.shell / (1 + SPIRAL.tube)
  const spiralAt = (i: number, reach: number, side: number, thick: number) => {
    const a = (far * i) / (SPIRAL.rings - 1)
    const out = outAtEnd * Math.exp(grows * (a - far))
    // rounded off where the spiral begins and where it ends
    const ends = Math.sqrt(Math.min(1, a / 0.6, (far - a) / 0.9))
    const [c, s] = [Math.cos(a), Math.sin(a)]
    const [dy, dz] = [grows * c - s, grows * s + c]
    const long = Math.hypot(dy, dz)
    const tube = SPIRAL.tube * out
    return {
      y: out * reach * c, z: out * reach * s, ty: dy / long, tz: dz / long,
      side: side * (out / outAtEnd) ** 0.75 * ends, above: thick * tube * ends, below: thick * tube * ends,
    }
  }
  const whorl = swept(SPIRAL.rings, SPIRAL.round)
  whorl.put(i => spiralAt(i, 1, BODY.shellWide / 2, 1))
  add(shell, whorl.shape, shellLook, 'shell')
  // its rim: a band of the primary colour along the spiral's outer edge, which glows as the boost grows
  const rim = swept(SPIRAL.rings, 8)
  rim.put(i => spiralAt(i, 1 + SPIRAL.tube * 0.93, BODY.shellWide * 0.13, 0.2))
  add(shell, rim.shape, rimLook, 'shell rim')
  /** Something of Eidos's own, made by Eidos's drawing: a plain shape lying flat, as thick as its size says. */
  const ofEidos = (id: string, shape: WorldElement['shape'], across: number, thick: number, colour: RolePath, finish: 'matte' | 'lit'): Object3D => {
    const element: WorldElement = { id, name: id, says: id, size: { x: across, y: across, z: thick }, shape, surface: { colour: role(colour), finish, says: finish } }
    const one = makeElement(world, element, colourOf)
    made.push(one)
    return one.thing
  }
  // its emblem on either side: Eidos's astroid in the primary colour, turning with the shell
  for (const hand of [-1, 1] as const) {
    const emblem = ofEidos('snail-emblem', { kind: 'astroid', radius: 0.4 }, 0.8, 0.07, 'noi.eio.color.action.primary', 'lit')
    emblem.rotation.y = (hand * Math.PI) / 2
    emblem.position.x = hand * 0.19
    shell.add(emblem)
  }
  const rod = (to: Object3D, from: readonly [number, number, number], end: readonly [number, number, number], radius: number, name: string) => {
    const [a, b] = [new THREE.Vector3(...from), new THREE.Vector3(...end)]
    const mesh = add(to, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), 10), metal, name)
    mesh.position.copy(a).add(b).multiplyScalar(0.5)
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.sub(a).normalize())
    return mesh
  }
  const AXLE_HALF = BODY.shellWide / 2 + 0.42
  rod(whole, [0 - AXLE_HALF, AXLE.along, AXLE.up], [AXLE_HALF, AXLE.along, AXLE.up], 0.075, 'axle')
  // the saddle: a strap over its back under the shell
  const strapShape = new THREE.TorusGeometry(1, 0.075, 8, 28, Math.PI)
  strapShape.rotateX(Math.PI / 2)
  const strap = add(whole, strapShape, metal, 'saddle')
  strap.position.set(0, AXLE.along, 0.2)
  strap.scale.set(BODY.wide / 2 + 0.05, 1, BODY.tall - 0.16)

  // ——— the booster: two engines beside it, each driven from the axle ———
  const engines = ([-1, 1] as const).map(hand => {
    const engine = new THREE.Group()
    engine.position.set(hand * ENGINE.across, ENGINE.along, ENGINE.up)
    whole.add(engine)
    add(engine, new THREE.CylinderGeometry(ENGINE.radius, ENGINE.radius, ENGINE.long, 24), metal, 'engine')
    // the way the shell's turning comes down to it, and what holds it to the saddle
    rod(whole, [hand * AXLE_HALF, AXLE.along, AXLE.up], [hand * (ENGINE.across - 0.08), ENGINE.along + 0.25, ENGINE.up + ENGINE.radius - 0.04], 0.065, 'drive')
    rod(whole, [hand * (BODY.wide / 2 - 0.1), AXLE.along - 0.1, 0.45], [hand * (ENGINE.across - ENGINE.radius + 0.05), ENGINE.along + 0.1, ENGINE.up - 0.05], 0.06, 'mount')
    // its intake: Eidos's ring in the secondary colour, and in it Eidos's astroid as a fan, as in the drone
    const intake = ofEidos('snail-intake', { kind: 'ring', outer: ENGINE.radius + 0.08, inner: ENGINE.fan + 0.03 }, 2 * (ENGINE.radius + 0.08), 0.16, 'noi.eio.color.action.secondary', 'matte')
    intake.rotation.x = 0 - Math.PI / 2
    intake.position.y = ENGINE.long / 2 - 0.04
    engine.add(intake)
    const fan = new THREE.Group()
    fan.position.y = ENGINE.long / 2 + 0.02
    engine.add(fan)
    const blades = ofEidos('snail-fan', { kind: 'astroid', radius: ENGINE.fan }, 2 * ENGINE.fan, 0.05, 'noi.eio.color.action.primary', 'lit')
    blades.rotation.x = 0 - Math.PI / 2
    fan.add(blades)
    // its nozzle, narrowing to the back, in the secondary colour
    const nozzle = add(engine, new THREE.CylinderGeometry(ENGINE.radius + 0.03, ENGINE.radius * 0.7, ENGINE.nozzle, 24, 1, true), cloth, 'nozzle')
    nozzle.position.y = 0 - ENGINE.long / 2 - ENGINE.nozzle / 2 + 0.03
    // its flame: three cones, one inside the other, each fading to nothing at its tip
    const flame = new THREE.Group()
    flame.position.y = 0 - ENGINE.long / 2 - ENGINE.nozzle + 0.08
    engine.add(flame)
    const cone = (colour: InstanceType<typeof THREE.Color>, strong: number, name: string) => {
      const shape = new THREE.ConeGeometry(1, 1, 20, 6, true)
      shape.rotateX(Math.PI).translate(0, -0.5, 0) // its wide end at the nozzle, its tip behind
      const places = shape.attributes.position!
      const fades = new Float32Array(places.count * 3)
      for (let i = 0; i < places.count; i++) fades.fill((1 + places.getY(i)) ** 1.6, i * 3, i * 3 + 3)
      shape.setAttribute('color', new THREE.BufferAttribute(fades, 3))
      return add(flame, shape, glowing(colour, strong), name)
    }
    const cones = { outer: cone(SECONDARY, FLAME.outer.strong, 'flame, outer'), inner: cone(PRIMARY, FLAME.inner.strong, 'flame, inner'), core: cone(WHITE, FLAME.core.strong, 'flame, core') }
    return { hand, fan, flame, cones }
  })
  // the light the flames throw on the platform behind it: bright in its middle, nothing at its edge
  const poolShape = new THREE.CircleGeometry(1, 28)
  const poolFades = new Float32Array(poolShape.attributes.position!.count * 3)
  poolFades.fill(1, 0, 3) // the first place of a circle is its middle
  poolShape.setAttribute('color', new THREE.BufferAttribute(poolFades, 3))
  const pool = add(rig, poolShape, glowing(PRIMARY), 'flame light')
  pool.position.set(0, ENGINE.along - ENGINE.long / 2 - 2.6, 0.04)

  // ——— its trail, on the strip behind it ———
  const trailPlaces = new Float32Array((TRAIL.places + 1) * 2 * 3)
  const trailFades = new Float32Array((TRAIL.places + 1) * 2 * 3)
  const trailShape = keep(new THREE.BufferGeometry())
  trailShape.setAttribute('position', new THREE.BufferAttribute(trailPlaces, 3))
  trailShape.setAttribute('color', new THREE.BufferAttribute(trailFades, 3))
  const trailFaces: number[] = []
  for (let k = 0; k < TRAIL.places; k++) trailFaces.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2)
  trailShape.setIndex(trailFaces)
  const trail = new THREE.Mesh(trailShape, glowing(PRIMARY))
  trail.name = 'trail'
  trail.frustumCulled = false
  world.xyz.add(trail)
  /** Where it has been, the newest first: how far along the strip, and how brightly it left its trail there. */
  let been: Array<{ y: number; bright: number }> = []
  const layTrail = (snail: Snail) => {
    const bright = TRAIL.faint + (TRAIL.bright - TRAIL.faint) * snail.boost
    if (been.length === 0 || snail.y - been[0]!.y >= TRAIL.every) been = [{ y: snail.y, bright }, ...been].slice(0, TRAIL.places)
    // from just behind the middle of its foot back to the oldest place kept
    const run = [{ y: snail.y - BODY.long * 0.2, bright }, ...been.filter(b => b.y < snail.y - BODY.long * 0.2)]
    run.forEach((b, k) => {
      const age = k / TRAIL.places
      const half = (TRAIL.wide / 2) * (1 - 0.6 * age)
      const f = strip.frame(0, Math.max(b.y, 0))
      const fade = b.bright * (1 - age) ** 1.6
      for (const [n, hand] of [[0, -1], [1, 1]] as const) {
        const p = onStrip(f, hand * half, 0, TRAIL.above)
        trailPlaces.set([p.x, p.y, p.z], (2 * k + n) * 3)
        trailFades.fill(fade, (2 * k + n) * 3, (2 * k + n) * 3 + 3)
      }
    })
    trailShape.attributes.position!.needsUpdate = true
    trailShape.attributes.color!.needsUpdate = true
    trailShape.setDrawRange(0, Math.max(0, run.length - 1) * 6)
  }

  // ——— the light, which goes with it ———
  const white = new THREE.Color(colourOf(LIGHT.colour))
  const onTop = SUN.up / Math.hypot(SUN.across, SUN.along, SUN.up)
  const sky = new THREE.HemisphereLight(white, white, LIGHT.plain * LIGHT.skyShare)
  sky.groundColor.setScalar(0)
  const sun = new THREE.DirectionalLight(white, (LIGHT.plain * (1 - LIGHT.skyShare)) / onTop)
  world.xyz.add(sky, sun, sun.target)

  // ——— the eye ———
  camera.near = 0.3
  camera.far = 9000
  let shot: ShotName = 'hero'
  /** Where the eye is now and what it looks at, in the snail's across, along and up; and how wide it sees. */
  let eye: { from: number[]; at: number[]; sees: number } | null = null
  let burning = 0
  const see = (f: Frame, snail: Snail, seconds: number, passed: number) => {
    burning = snail.boost > 0.05 ? burning + passed : 0
    shot = shotFor(snail, burning)
    const want = SHOTS[shot]
    if (!eye) eye = { from: [...want.from], at: [...want.at], sees: want.sees }
    const share = 1 - Math.exp(0 - passed / EYE_GLIDES)
    for (let k = 0; k < 3; k++) {
      eye.from[k]! += (want.from[k]! - eye.from[k]!) * share
      eye.at[k]! += (want.at[k]! - eye.at[k]!) * share
    }
    eye.sees += (want.sees - eye.sees) * share
    // at speed it sees wider, and the boost shakes it a little
    const fast = Math.min(snail.speed / FASTEST, 1)
    const shake = 0.05 * snail.boost
    const from = onStrip(f, eye.from[0]! + shake * Math.sin(seconds * 47), eye.from[1]!, eye.from[2]! + shake * Math.sin(seconds * 61 + 1))
    const to = onStrip(f, eye.at[0]!, eye.at[1]!, eye.at[2]!)
    camera.fov = eye.sees + 9 * fast
    camera.updateProjectionMatrix()
    camera.position.set(...toThree(at(from.x, from.y, from.z)))
    // the eye's own three ways, in three.js's order: it looks along its own minus z, its up the strip's up
    const V = THREE.Vector3
    const [a, b, up] = [new V(...toThree(at(from.x, from.y, from.z))), new V(...toThree(at(to.x, to.y, to.z))), new V(...toThree(at(f.up.x, f.up.y, f.up.z)))]
    const away = a.sub(b).normalize()
    const right = up.clone().cross(away).normalize()
    const top = away.clone().cross(right)
    camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, top, away))
  }

  const V3 = (v: Xyz) => new THREE.Vector3(v.x, v.y, v.z)
  return {
    get shot() { return shot },
    show(snail, seconds, passed) {
      const f = strip.frame(0, Math.min(Math.max(snail.y, 0), strip.long))
      const foot = onStrip(f, 0, 0, 0)
      rig.matrix.makeBasis(V3(f.across), V3(f.along), V3(f.up)).setPosition(foot.x, foot.y, foot.z)
      rig.matrixWorldNeedsUpdate = true

      const fast = Math.min(snail.speed / FASTEST, 1)
      const gaining = Math.min(Math.max(snail.speedingUp / FASTEST_WIND_UP, 0), 1)
      const turning = spinShare(snail.spin)
      // it stretches as it gains speed, tucks its head down as it boosts, and ripples while it crawls
      const long = BODY.long * (1 + 0.07 * gaining + 0.05 * fast)
      const rise = (BODY.headUp - 0.5) * (1 - 0.34 * snail.boost) + 0.03 * Math.sin(seconds * 1.7)
      now = { long, rise, ripple: 1 - 0.85 * fast, beat: seconds * 0.6 }
      shapeBody()
      // it leans back a little as it launches, about the back of its foot, and trembles with the boost
      whole.rotation.x = 0.05 * gaining
      whole.position.set(0, 0, 0.012 * snail.boost * Math.sin(seconds * 53))

      const neck = onBody(0.9)
      head.position.set(0, neck.y, neck.z)
      head.rotation.x = neck.pitch * 0.5
      for (const { stalk, eye: ball, hand } of stalks) {
        // the stalks stand a little forward and apart; they sway; they sweep back with its speed
        stalk.rotation.set(-0.22 + 1.05 * fast + 0.07 * Math.sin(seconds * 1.4 + hand), hand * (0.3 - 0.12 * fast), 0)
        ball.rotation.x = 0 - (-0.22 + 1.05 * fast) * 0.8 // its eyes keep looking ahead
      }
      const collar = onBody(0.8)
      scarf.position.set(0, collar.y, collar.z)
      scarf.rotation.x = collar.pitch
      band.scale.set(collar.girth * 1.03, 0.55, collar.girth * 1.03)
      for (const { hand, places, shape } of tails) {
        // each tail hangs at rest and streams back at speed, past the shell's side; a wave runs down it
        const streams = smooth(0.02, 0.4, fast)
        const way = new THREE.Vector3(hand * mix(0.4, 0.2, streams), mix(-0.75, -1, streams), mix(-0.6, 0.16, streams)).normalize()
        const wide = new THREE.Vector3().crossVectors(way, new THREE.Vector3(hand, 0, 0)).normalize()
        const sideways = new THREE.Vector3(hand, 0, 0)
        const knot = new THREE.Vector3(hand * collar.girth * 0.8, collar.y - 0.12, collar.z + collar.girth * 0.55)
        for (let k = 0; k <= TAIL.parts; k++) {
          const s = k / TAIL.parts
          const flap = (0.07 + 0.3 * streams) * s * Math.sin(seconds * (5 + 20 * streams) - s * 7 + hand)
          const middle = knot.clone().addScaledVector(way, s * TAIL.long).addScaledVector(sideways, flap * hand).addScaledVector(wide, flap * 0.5)
          const half = (TAIL.wide / 2) * (1 - 0.35 * s)
          const [one, other] = [middle.clone().addScaledVector(wide, half), middle.clone().addScaledVector(wide, 0 - half)]
          places.set([one.x, one.y, one.z, other.x, other.y, other.z], k * 6)
        }
        shape.attributes.position!.needsUpdate = true
        shape.computeVertexNormals()
      }

      // the shell turns forward, as a wheel rolling its way would; its rim glows with the boost
      shell.rotation.x = 0 - 2 * Math.PI * snail.turned
      rimLook.emissiveIntensity = 0.2 + 1.5 * Math.max(turning * 0.6, snail.boost)
      for (const { hand, fan, flame, cones } of engines) {
        fan.rotation.y = hand * 2 * Math.PI * snail.turned * 3
        flame.visible = snail.boost > 0.01
        const flicker = 1 + 0.09 * Math.sin(seconds * 39 + hand) + 0.05 * Math.sin(seconds * 97 + 2 * hand)
        const girth = 0.55 + 0.45 * snail.boost
        for (const part of ['outer', 'inner', 'core'] as const) {
          cones[part].scale.set(FLAME[part].radius * girth, FLAME[part].long * snail.boost * flicker, FLAME[part].radius * girth)
        }
      }
      pool.visible = snail.boost > 0.01
      pool.scale.set(1.7 + 0.5 * snail.boost, 2 + 2 * snail.boost, 1)
      ;(pool.material as InstanceType<typeof THREE.MeshBasicNodeMaterial>).opacity = 0.3 * snail.boost

      layTrail(snail)
      // the light: the sky is up as the strip is up here, and the sun stands where it stands from the snail
      sky.position.set(f.up.x, f.up.y, f.up.z)
      const lit = onStrip(f, 0, 0, 1)
      const from = onStrip(f, SUN.across, SUN.along, SUN.up)
      sun.position.set(from.x, from.y, from.z)
      sun.target.position.set(lit.x, lit.y, lit.z)
      see(f, snail, seconds, passed)
    },
    jumped() {
      been = []
    },
    gone() {
      rig.removeFromParent()
      trail.removeFromParent()
      sky.removeFromParent()
      sun.removeFromParent()
      sun.target.removeFromParent()
      sky.dispose()
      sun.dispose()
      for (const one of made) one.gone()
      for (const thing of kept) thing.dispose()
    },
  }
}
