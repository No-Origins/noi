// THE CHARACTERS (noi.eio.world.character): Clay, the Mannequin and the Fairy Bot, made with Meshy.ai in
// the old No Origins project and brought in at the user's word (17 Nov: Clay; then "we should bring in
// Mannequin and Fairyboat too"). three.js draws them. The painter below was made for the first world's stage,
// which lent it its WebGL 2 picture and its eye; that stage is gone (23 Nov), and the characters go into the
// new world next, where three.js draws everything.
// Their height comes from Eidos (noi.eio.world.character.height, 6 feet). Their files are small copies
// (tools/trim-character.mjs) kept in this package's assets/characters, served by the app that shows them.
import type { Vec3 } from './character-measures.ts'

/** One character's files, as the app serves them. */
export interface CharacterFiles {
  /** Its name, as people call it: Clay, the Mannequin, the Fairy Bot. */
  name: string
  /** The model: mesh, bones, clips. */
  model: string
  /** Its look: one picture put on the whole of it. */
  look: string
  /** The Fairy Bot's wings, hung on its upper back. */
  wings?: string
}

/** The three characters' files in this package (assets/characters), as paths the app serves them under
 * its own address: Clay first, the character chosen for now (the user, 17 Nov). */
export function characterFiles(base: string): CharacterFiles[] {
  const at = (p: string) => `${base.replace(/\/$/, '')}/characters/${p}`
  return [
    { name: 'Clay', model: at('clay/clay.glb'), look: at('clay/clay.jpg') },
    { name: 'The Mannequin', model: at('mannequin/mannequin.glb'), look: at('mannequin/mannequin.jpg') },
    { name: 'The Fairy Bot', model: at('fairy-bot/fairy-bot.glb'), look: at('fairy-bot/fairy-bot.jpg'), wings: at('fairy-bot/wings.glb') },
  ]
}

/** What a character does on a stage: stands, walks, or runs: the motions Mero holds for the character
 * drawing (Component States, agreed 18 Nov). */
import type { CharacterDrawingMotion as Motion } from '@noi/eio-tokens/components'
export type { Motion }

/** Walking and running are clips of those names, in every rig. Standing is no clip at all (the user, 17 Nov:
 * not the resting idle "with the right leg bent", but "an ideal state where they're just standing"): the pose
 * the rig was made in, legs straight, with its arms brought down to its sides (see STANDING). */
const CLIPS: Record<Motion, string | null> = { stand: null, walk: 'Walking', run: 'Running' }

/** Standing: each upper arm turned until it hangs down, a little away from the body so the hand clears the hip
 * (as a share of straight down: 0 would be against the side). MY PICK, looked at on all three rigs. */
const STANDING = { out: 0.2, arms: [['mixamorigLeftArm', 'mixamorigLeftForeArm', 1], ['mixamorigRightArm', 'mixamorigRightForeArm', -1]] as const }

/** The old project's walk and run strides: how far one turn of each clip carries the feet, so they keep to
 * the ground at any speed (the world page's numbers). */
const STRIDE = { walk: 1.1, run: 1.9 }

/** The Fairy Bot's wings, where the old project hung them (its FAIRY_WINGS, the user's tuning): tip to tip,
 * the join's height and how far behind the body, how far the tops tip back, and the flutter. As shares of the
 * character's height, so they keep their place at any height. MY READING, not found in the old project:
 * that its Fairy Bot stood 1.8 metres when the user tuned them. */
const WINGS = { span: 1.2 / 1.8, height: 1.02 / 1.8, back: 0.23 / 1.8, lean: 10, flaps: 3, angle: 30, bone: 'mixamorigSpine2', native: 1.903 }

// three.js is asked for only when a stage shows a character, so pages without one do not carry it.
type Three = typeof import('three')
type Loaded = { root: import('three').Object3D; holder: import('three').Group; mixer: import('three').AnimationMixer; clips: Record<string, import('three').AnimationClip>; wings: import('three').Object3D[] }

export class CharacterPainter {
  private three: Three | null = null
  private renderer: import('three').WebGLRenderer | null = null
  private scene: import('three').Scene | null = null
  private camera: import('three').PerspectiveCamera | null = null
  private loaded: Loaded[] = []
  private key = ''
  private last = 0
  /** Why nothing is drawn, when nothing can be. */
  why = ''

  private gl: WebGL2RenderingContext
  private canvas: HTMLCanvasElement
  private changed: () => void

  // (Its three fields are set here by hand, not as parameter properties, so that Node can load the package for
  // its tests: Node strips types and does nothing else.)
  constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement, changed: () => void) {
    this.gl = gl
    this.canvas = canvas
    this.changed = changed
  }

  /** Loads the characters (once for the same files), stands them in a row facing the eye, `height` tall,
   * `apart` metres between them, in `motion`. */
  async show(files: CharacterFiles[], height: number, apart: number, motion: Motion, sky: string, ground: string) {
    const key = JSON.stringify([files, height, apart])
    if (key === this.key) { this.play(motion); return }
    this.key = key
    try {
      const THREE = this.three ?? (this.three = await import('three'))
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (!this.renderer) {
        this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, context: this.gl })
        this.renderer.autoClear = false
        this.camera = new THREE.PerspectiveCamera()
        this.camera.matrixAutoUpdate = false; this.camera.matrixWorldAutoUpdate = false
      }
      // the same light as the land's: from the sky, and one sun from the same side as the world's painters
      const scene = new THREE.Scene()
      void sky
      scene.add(new THREE.HemisphereLight(new THREE.Color(1, 1, 1), new THREE.Color(ground), 1.5))
      const sun = new THREE.DirectionalLight(new THREE.Color(1, 1, 1), 2.2); sun.position.set(0.45, 0.80, 0.30); scene.add(sun)
      const loader = new GLTFLoader()
      const gltfs = await Promise.all(files.map(f => loader.loadAsync(f.model)))
      const looks = await Promise.all(files.map(f => new THREE.TextureLoader().loadAsync(f.look)))
      this.loaded = []
      for (let i = 0; i < files.length; i++) {
        const g = gltfs[i], look = looks[i]
        look.flipY = false; look.colorSpace = THREE.SRGBColorSpace
        const root = g.scene, box = new THREE.Box3()
        root.updateMatrixWorld(true)
        root.traverse(o => {
          const m = o as import('three').Mesh
          if (!m.isMesh) return
          m.frustumCulled = false
          m.material = new THREE.MeshStandardMaterial({ map: look, roughness: 0.6, metalness: 0.05 })
          const sk = o as import('three').SkinnedMesh
          if (sk.isSkinnedMesh) { sk.computeBoundingBox(); box.union(sk.boundingBox!.clone().applyMatrix4(sk.matrixWorld)) } else box.expandByObject(o)
        })
        // as tall as Eidos says, feet on the ground, the middle of him over his place
        const k = height / Math.max(1e-6, box.max.y - box.min.y), inner = new THREE.Group(), holder = new THREE.Group()
        inner.add(root); inner.scale.setScalar(k)
        inner.position.set(-k * (box.min.x + box.max.x) / 2, -k * box.min.y, -k * (box.min.z + box.max.z) / 2)
        holder.add(inner); holder.position.set((i - (files.length - 1) / 2) * apart, 0, 0); scene.add(holder)
        // the clips: his own
        const clips: Record<string, import('three').AnimationClip> = {}
        for (const a of g.animations) clips[a.name] = a
        const wings: import('three').Object3D[] = []
        if (files[i].wings) {
          const w = (await loader.loadAsync(files[i].wings!)).scene, bone = root.getObjectByName(WINGS.bone)
          w.scale.setScalar(WINGS.span * height / WINGS.native)
          w.position.set(0, WINGS.height * height, -WINGS.back * height)
          w.rotation.x = -WINGS.lean * Math.PI / 180
          holder.add(w); holder.updateMatrixWorld(true)
          if (bone) bone.attach(w)                                     // so they move with his upper back
          for (const n of ['wing-left', 'wing-right']) { const half = w.getObjectByName(n); if (half) wings.push(half) }
        }
        this.loaded.push({ root, holder, mixer: new THREE.AnimationMixer(root), clips, wings })
      }
      this.scene = scene
      this.why = ''
      // the motion and speed the stage asked for while they loaded (play() keeps them), so a walk or a run
      // turns at its speed from the first moment
      this.play(this.motion, this.speed)
      this.changed()
    } catch (e) {
      this.why = `The characters could not be drawn here (${e instanceof Error ? e.message : String(e)}).`
      this.changed()
    }
  }

  private motion: Motion = 'stand'
  private speed = 0
  /** Plays a motion; `speed` (metres a second) sets how fast a walk or a run turns, so the feet keep to the ground. */
  play(motion: Motion, speed = 0) {
    this.motion = motion; this.speed = speed
    for (const c of this.loaded) {
      c.mixer.stopAllAction()
      if (motion === 'stand') { this.stand(c); continue }
      const name = CLIPS[motion]
      const clip = name ? c.clips[name] : undefined
      if (!clip) { this.stand(c); continue }
      const act = c.mixer.clipAction(clip)
      if (speed > 0) act.setEffectiveTimeScale(speed / STRIDE[motion] * clip.duration)
      act.play()
    }
  }

  /** Standing: the pose the rig was made in (its bind pose: legs straight), with each upper arm turned in the
   * world until it hangs down beside the body, a little out. The same for every rig, whatever its bones' axes. */
  private stand(c: Loaded) {
    const THREE = this.three
    c.root.traverse(o => { const sk = o as import('three').SkinnedMesh; if (sk.isSkinnedMesh) sk.skeleton.pose() })
    if (!THREE) return
    c.holder.updateMatrixWorld(true)
    for (const [armName, foreName, side] of STANDING.arms) {
      const arm = c.root.getObjectByName(armName), fore = c.root.getObjectByName(foreName)
      if (!arm || !fore || !arm.parent) continue
      const from = fore.getWorldPosition(new THREE.Vector3()).sub(arm.getWorldPosition(new THREE.Vector3())).normalize()
      const to = new THREE.Vector3(side * STANDING.out, -1, 0).normalize()          // his left is +x; he faces +z
      const turn = new THREE.Quaternion().setFromUnitVectors(from, to)
      const world = arm.getWorldQuaternion(new THREE.Quaternion()), parent = arm.parent.getWorldQuaternion(new THREE.Quaternion())
      arm.quaternion.copy(parent.invert().multiply(turn.multiply(world)))
      arm.updateMatrixWorld(true)
    }
  }

  /** Draws them with the stage's eye. `still`: reduced motion, so the clips keep their first moment. */
  draw(P: ArrayLike<number>, V: ArrayLike<number>, seconds: number, still: boolean) {
    const r = this.renderer, cam = this.camera, scene = this.scene
    if (!r || !cam || !scene) return
    const dt = still ? 0 : Math.min(0.1, Math.max(0, seconds - this.last)); this.last = seconds
    for (const c of this.loaded) {
      c.mixer.update(dt)
      // the Fairy Bot's wings flutter while it moves, as in the old project; standing, they rest open
      const resting = still || this.motion === 'stand', fold = resting ? 0 : (Math.sin(seconds * WINGS.flaps * 2 * Math.PI) * 0.5 + 0.5) * WINGS.angle * Math.PI / 180
      c.wings.forEach((w, i) => { w.rotation.y = (i === 0 ? 1 : -1) * fold })
    }
    if (r.domElement.width !== this.canvas.width || r.domElement.height !== this.canvas.height) r.setSize(this.canvas.width, this.canvas.height, false)
    r.resetState()
    cam.projectionMatrix.fromArray(Array.from(P)); cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert()
    cam.matrixWorldInverse.fromArray(Array.from(V)); cam.matrixWorld.copy(cam.matrixWorldInverse).invert()
    r.render(scene, cam)
    r.resetState()
  }

  /** How many characters are standing, and where each one's feet are. */
  places(): Vec3[] { return this.loaded.map(c => [c.holder.position.x, 0, c.holder.position.z]) }

  get ready() { return this.loaded.length > 0 && !!this.scene }

  destroy() {
    for (const c of this.loaded) c.mixer.stopAllAction()
    this.loaded = []
    this.renderer?.dispose()
  }
}
