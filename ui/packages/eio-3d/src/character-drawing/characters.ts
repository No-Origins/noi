// THE CHARACTERS (noi.eio.world.character): Clay, the Mannequin and the Fairy Bot, made with Meshy.ai in the old
// No Origins project and brought in at the user's word (17 Nov: Clay; then "we should bring in Mannequin and
// Fairyboat too"). On 23 Nov: "bring in the characters into elements". So each is an element of the world now, in
// a folder of its own (clay/, mannequin/, fairy-bot/), and this is the code that draws any of them: it loads a
// character's model, its look and its wings when the character is first shown, puts them into the world's three.js
// scene inside the element's body (so inside `xyz`), and plays what its state says. Till 23 Nov it was a painter of
// its own, with its own renderer, scene, eye and lights, lent a picture by the first world's stage; that stage is
// gone, and here the world's own three.js draws them, lit by the world's own light.
// Their height and the room they take up come from Eidos; so does how far their arms hang out. Their files are
// small copies (tools/trim-character.mjs) kept in this package's assets/characters, served by the page that shows
// them (ThreeWorld, `assets`).
import type { CharacterDrawingMotion as Motion } from '@noi/eio-tokens/components'
import type { AnimationAction, AnimationClip, AnimationMixer, Material, Mesh, Object3D, SkinnedMesh, Texture } from 'three/webgpu'
import { role, value } from '../drawing/eidos.ts'
import type { ElementState, Surface } from '../drawing/element.ts'
import type { Drawn, DrawnHow } from '../drawing/make.ts'
import type { Size, ThreeWorld } from '../drawing/space.ts'

export type { Motion }

/** One character's files, by their place in this package's assets/characters. */
export interface CharacterFiles {
  /** The model: its mesh, its bones, its clips. */
  readonly model: string
  /** Its look: one picture over the whole of it. */
  readonly look: string
  /** Wings hung on its upper back, when it has them (the Fairy Bot). */
  readonly wings?: CharacterWings
}

/** Wings, and how they are hung: from where the old project hung the Fairy Bot's (its FAIRY_WINGS). */
export interface CharacterWings {
  /** The wings' own file: two halves, `wing-left` and `wing-right`, each with its own pictures. */
  readonly file: string
  /** Tip to tip, in metres. */
  readonly span: number
  /** How high above its feet their middle is, and how far behind its middle, in metres. */
  readonly height: number
  readonly back: number
  /** How far their tops are tipped back, in degrees. */
  readonly lean: number
  /** While it moves they flutter: each half turns so many degrees and back, once every so many seconds. */
  readonly flap: number
  readonly flapEvery: number
}

/** The room every character takes up: so wide along x, so deep along y, and as tall as a character is. */
export const CHARACTER_SIZE: Size = {
  x: value('noi.eio.world.character.width'),
  y: value('noi.eio.world.character.depth'),
  z: value('noi.eio.world.character.height'),
}

/** A character's surface: matte, its own picture over the whole of it, as the picture is (its colour is the
 * light's white, which leaves the picture's own colours as they are). */
export const CHARACTER_SURFACE: Surface = { colour: role('noi.eio.color.world.light'), finish: 'matte', says: 'matte, its own picture over the whole of it' }

/** Walking and running are clips of those names, in every rig. Standing is no clip at all (the user, 17 Nov: not
 * the resting idle "with the right leg bent", but "an ideal state where they're just standing"): the pose the rig
 * was made in, legs straight, with its arms brought down to its sides. Both clips walk and run on the spot: their
 * hips stay over the character's place. */
const CLIPS: Record<Motion, string | null> = { stand: null, walk: 'Walking', run: 'Running' }

/** Standing: each upper arm turned until it hangs down, a little out from the body so the hand clears the hip:
 * as a share of straight down (0 would be against the side). And the joints that turns, by their names in every
 * rig (GLTFLoader drops the colon of mixamorig:LeftArm). */
const ARMS = {
  out: value('noi.eio.world.character.arms-out'),
  sides: [['mixamorigLeftArm', 'mixamorigLeftForeArm', 1], ['mixamorigRightArm', 'mixamorigRightForeArm', -1]] as const,
}

/** The joint the wings hang from, so they go with the upper back; and the wings' two halves, which flutter. */
const WINGS = { joint: 'mixamorigSpine2', halves: ['wing-left', 'wing-right'] } as const

type Three = ThreeWorld['three']
type Loaded = { mixer: AnimationMixer; clips: Map<string, AnimationClip>; playing: AnimationAction | null; halves: Object3D[]; owned: Object3D[]; textures: Texture[]; surface: Material }

/** What draws a character from its files, as an element's data hands it in (element.ts, Model). */
export function character(files: CharacterFiles): (world: ThreeWorld, how: DrawnHow) => Drawn {
  return (world, how) => drawCharacter(world, how, files)
}

function drawCharacter(world: ThreeWorld, how: DrawnHow, files: CharacterFiles): Drawn {
  const THREE = world.three
  const thing = new THREE.Group()
  thing.name = 'character'
  // A model's own frame is y up, facing +z (glTF). Inside `xyz` z is up and x is turned round (a mirror). This holder
  // turns the one into the other: a quarter turn about x stands the model up, and x turned round again undoes the
  // mirror. Then it stands upright, the right way round, and faces low y: an element's front.
  const holder = new THREE.Group()
  holder.rotation.x = Math.PI / 2
  holder.scale.x = -1
  thing.add(holder)

  let wanted: Motion = 'stand'
  let loaded: Loaded | null = null
  let left = false
  let clock = 0

  const play = (motion: Motion) => {
    if (!loaded) return
    const name = CLIPS[motion]
    const clip = name ? loaded.clips.get(name) : undefined
    const next = clip ? loaded.mixer.clipAction(clip) : null
    if (next === loaded.playing) return
    // it goes over from one to the other as every thing does, in the time a change of state takes; back to standing,
    // the clip fades and leaves the pose it started from
    loaded.playing?.fadeOut(how.change)
    next?.reset().fadeIn(how.change).play()
    loaded.playing = next
  }

  const ready = load(world, holder, files, how).then(done => {
    if (left) { forget(done); return }
    loaded = done
    play(wanted)
  })
  // whoever shows the character says why when it cannot be drawn, from `ready`
  ready.catch(() => undefined)

  return {
    thing,
    ready,
    act(state: ElementState | undefined) {
      wanted = state?.motion ?? 'stand'
      play(wanted)
    },
    step(passed) {
      clock += passed
      if (!loaded) return
      loaded.mixer.update(passed)
      // the Fairy Bot's wings flutter while it moves, as in the old project; standing, they rest open
      const wings = files.wings
      if (!wings) return
      const fold = wanted === 'stand' ? 0 : (Math.sin((clock * 2 * Math.PI) / wings.flapEvery) * 0.5 + 0.5) * wings.flap * (Math.PI / 180)
      loaded.halves.forEach((half, i) => { half.rotation.y = (i === 0 ? 1 : -1) * fold })
    },
    gone() {
      left = true
      thing.removeFromParent()
      if (loaded) forget(loaded)
      loaded = null
    },
  }
}

/** Loads a character's files from where the page serves them, and puts it together inside its holder: standing,
 * as tall as a character is, its feet on its place, the middle of it over the middle of its place. Fails with
 * plain words when they cannot be loaded. */
async function load(world: ThreeWorld, holder: InstanceType<Three['Group']>, files: CharacterFiles, how: DrawnHow): Promise<Loaded> {
  const THREE = world.three
  const base = world.assets
  if (!base) throw new Error('This page does not serve the characters\' files.')
  const at = (file: string) => `${base.replace(/\/$/, '')}/characters/${file}`
  let gltf, look, wings
  try {
    // three.js keeps its loader for model files outside its core: it is asked for here, when a character is first
    // shown, and it draws with the world's own three.js (one core for both)
    const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
    const loader = new GLTFLoader()
    ;[gltf, look, wings] = await Promise.all([
      loader.loadAsync(at(files.model)),
      new THREE.TextureLoader().loadAsync(at(files.look)),
      files.wings ? loader.loadAsync(at(files.wings.file)) : Promise.resolve(null),
    ])
  } catch (why) {
    throw new Error(`Its files could not be loaded (${why instanceof Error ? why.message : String(why)}).`)
  }
  // its look: one picture over the whole of it, in the drawing's matte surface
  look.flipY = false
  look.colorSpace = THREE.SRGBColorSpace
  const surface = how.pictured(look)
  const root: Object3D = gltf.scene
  const skinned: SkinnedMesh[] = []
  root.traverse(o => {
    const mesh = o as Mesh
    if (!mesh.isMesh) return
    mesh.material = surface
    // its bones move it out of the bounds three.js keeps for its shape: it is always drawn
    mesh.frustumCulled = false
    if ((o as SkinnedMesh).isSkinnedMesh) skinned.push(o as SkinnedMesh)
  })
  // standing: the pose the rig was made in (its bind pose: legs straight)
  for (const sk of skinned) sk.skeleton.pose()
  // as tall as a character is: measured in that pose; the feet on its place, the middle of it over it
  root.updateMatrixWorld(true)
  const box = new THREE.Box3()
  for (const sk of skinned) {
    sk.computeBoundingBox()
    if (sk.boundingBox) box.union(sk.boundingBox.clone().applyMatrix4(sk.matrixWorld))
  }
  const tall = box.max.y - box.min.y
  if (!(tall > 0)) throw new Error('Its model has no height.')
  const k = CHARACTER_SIZE.z / tall
  const inner = new THREE.Group()
  inner.add(root)
  inner.scale.setScalar(k)
  inner.position.set((0 - k * (box.min.x + box.max.x)) / 2, 0 - k * box.min.y, (0 - k * (box.min.z + box.max.z)) / 2)
  holder.add(inner)
  holder.updateWorldMatrix(true, true)
  // its arms brought down to its sides
  armsDown(THREE, holder, root)
  // the wings, when it has them, hung from its upper back so they go with it; each half flutters
  const halves: Object3D[] = []
  const owned: Object3D[] = [root]
  const textures: Texture[] = [look]
  if (wings && files.wings) {
    const w: Object3D = wings.scene
    const own = new THREE.Box3().setFromObject(w)
    w.scale.setScalar(files.wings.span / (own.max.x - own.min.x))
    w.position.set(0, files.wings.height, 0 - files.wings.back)
    w.rotation.x = (0 - files.wings.lean) * (Math.PI / 180)
    holder.add(w)
    holder.updateWorldMatrix(true, true)
    root.getObjectByName(WINGS.joint)?.attach(w)
    for (const name of WINGS.halves) { const half = w.getObjectByName(name); if (half) halves.push(half) }
    owned.push(w)
    w.traverse(o => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.frustumCulled = false
      for (const s of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
        for (const v of Object.values(s)) if ((v as Texture | null)?.isTexture) textures.push(v as Texture)
      }
    })
  }
  // its clips: its own, by their names
  const clips = new Map(gltf.animations.map(clip => [clip.name, clip] as const))
  return { mixer: new THREE.AnimationMixer(root), clips, playing: null, halves, owned, textures, surface }
}

/** Brings each upper arm down to the side, a little out: from the pose the rig was made in, the same for every
 * rig whatever its bones' own axes. "Down" and "out" are the character's own (its left is its +x, up its +y), turned
 * as it stands in the world. */
function armsDown(THREE: Three, holder: Object3D, root: Object3D) {
  for (const [armName, foreName, side] of ARMS.sides) {
    const arm = root.getObjectByName(armName)
    const fore = root.getObjectByName(foreName)
    if (!arm || !fore || !arm.parent) continue
    const from = fore.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).normalize()
    const to = new THREE.Vector3(side * ARMS.out, -1, 0).transformDirection(holder.matrixWorld)
    const turn = new THREE.Quaternion().setFromUnitVectors(from, to)
    const now = arm.getWorldQuaternion(new THREE.Quaternion())
    const parent = arm.parent.getWorldQuaternion(new THREE.Quaternion())
    arm.quaternion.copy(parent.invert().multiply(turn.multiply(now)))
    arm.updateMatrixWorld(true)
  }
}

/** Gives back what a loaded character held: its shapes, its surfaces and its pictures. */
function forget(loaded: Loaded) {
  loaded.mixer.stopAllAction()
  for (const root of loaded.owned) {
    root.traverse(o => {
      const mesh = o as Mesh
      if (!mesh.isMesh) return
      mesh.geometry.dispose()
      const skinned = o as SkinnedMesh
      if (skinned.isSkinnedMesh) skinned.skeleton.dispose()
      for (const surface of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) if (surface !== loaded.surface) surface.dispose()
    })
  }
  loaded.surface.dispose()
  for (const picture of loaded.textures) picture.dispose()
}
