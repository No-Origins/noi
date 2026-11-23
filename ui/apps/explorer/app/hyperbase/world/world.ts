// THE NEW 3D WORLD of Hyperbase Studio (21 Nov 2026). The first world was set aside at the user's word, and the
// new one begins from the user's three answers of that day: a new picture of their own (nothing of the first
// world is assumed), no panels unless asked for, and three.js draws all of it. So this is the STAGE: a renderer,
// a scene, an eye, and a picture drawn on every frame. What stands on it is put there by what opens it: the
// land and its coordinates (land.ts, drawLand.ts), and after that whatever the user's picture asks for.
//
// THE USER'S x, y, z (place.ts) meet three.js's own order HERE: the stage holds one group, `xyz`, turned (and,
// since the user had x turned round on 22 Nov 2026, mirrored) so that its three directions are the user's. Everything of the world goes inside it and is placed there by the
// user's x, y, z; nothing else is put straight into the scene. (The eye alone stays outside, where three.js's
// own mover wants it, and crosses by the same two functions: drawLand.ts.)
//
// The world's elements live in Eidos's own package, @noi/eio-3d (23 Nov 2026): each is made there by three.js from
// its data, with every number and colour from Eidos, and put into this stage's `xyz`. The stage, its eye, the land
// and the pages stay in the Explorer while the world is a lab.
//
// three.js is asked for only when the world opens, so no other page carries it. Its newer renderer is used: it
// draws with WebGPU where the browser has it and with WebGL 2 where not, from the same code.
import type { ThreeWorld } from '@noi/eio-3d'
import type { Group, OrthographicCamera, PerspectiveCamera, Scene, WebGPURenderer } from 'three/webgpu'
import { at, toThree } from './place.ts'

/** At most this many picture dots for each dot of the page: past it the cost grows and the eye sees no more. */
export const MOST_DOTS = 2

/** The picture's size in its own dots, for a place on the page of this size on a screen this fine. Never less
 * than one dot each way, so a stage that is not laid out yet does not ask the card for a picture of nothing. */
export function pictureSize(width: number, height: number, fineness: number): { width: number; height: number; dots: number } {
  const dots = Math.min(Math.max(fineness || 1, 1), MOST_DOTS)
  return { width: Math.max(1, Math.floor(width * dots)), height: Math.max(1, Math.floor(height * dots)), dots }
}

export interface WorldLook {
  /** The colour behind everything, as the page's style gives it. */
  background: string
}

/** How the eye of a stage sees. `perspective`: far things are smaller, as a person sees them (the 3D view of
 * one element). `orthographic`: a thing is as large far as near, and lines that run side by side stay side by
 * side: what an isometric view needs (the land, at the user's word of 22 Nov 2026). */
export type Seeing = 'perspective' | 'orthographic'

/** The open world. `close` stops the drawing and gives the card's memory back. It is the three.js world the
 * elements of @noi/eio-3d are drawn into. */
export interface World extends ThreeWorld {
  /** What draws it in this browser. */
  readonly backend: 'webgpu' | 'webgl'
  /** How many pictures have been drawn: it grows while the world is alive. */
  readonly frames: number
  /** three.js itself, as this page loaded it: for checks and tools, which cannot ask for it by name. */
  readonly three: typeof import('three/webgpu')
  /** three.js's own language for what a surface shows, loaded with it. */
  readonly tsl: typeof import('three/tsl')
  readonly renderer: WebGPURenderer
  readonly scene: Scene
  readonly camera: PerspectiveCamera | OrthographicCamera
  /** For an eye that sees orthographic: how many metres of the world the picture holds from its bottom to its
   * top. An eye that sees in perspective is not changed by it. */
  shows(metres: number): void
  /** Where everything of the world goes: inside it a position is the user's x, y, z, with z up. */
  readonly xyz: Group
  /** Calls `fn` before every picture is drawn. Returns what stops it. */
  eachFrame(fn: () => void): () => void
  close(): void
}

/** Where this app serves @noi/eio-3d's assets (app/3d): the characters' models and looks, under `characters/`. */
export const ASSETS = '/3d'

/** Opens the world on a canvas. Rejects when the browser can draw neither with WebGPU nor with WebGL 2. */
export async function openWorld(canvas: HTMLCanvasElement, look: WorldLook, sees: Seeing = 'perspective'): Promise<World> {
  const THREE = await import('three/webgpu')
  const TSL = await import('three/tsl')
  const renderer = new THREE.WebGPURenderer({ canvas, antialias: true })
  await renderer.init()

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(look.background)
  // an orthographic eye sees from 1 m to 4 km before it, far enough for an eye that stands well back
  const camera = sees === 'orthographic' ? new THREE.OrthographicCamera(-1, 1, 1, -1, 1, 4000) : new THREE.PerspectiveCamera()
  let metresShown = 100

  // the user's three directions, each as three.js sees it, make the turn that `xyz` carries
  const xyz = new THREE.Group()
  const along = (x: number, y: number, z: number) => new THREE.Vector3(...toThree(at(x, y, z)))
  xyz.applyMatrix4(new THREE.Matrix4().makeBasis(along(1, 0, 0), along(0, 1, 0), along(0, 0, 1)))
  scene.add(xyz)

  const fit = () => {
    const size = pictureSize(canvas.clientWidth, canvas.clientHeight, window.devicePixelRatio)
    renderer.setPixelRatio(size.dots)
    renderer.setSize(canvas.clientWidth || 1, canvas.clientHeight || 1, false)
    const widthToHeight = size.width / size.height
    if ('aspect' in camera) camera.aspect = widthToHeight
    else {
      camera.top = metresShown / 2
      camera.bottom = 0 - metresShown / 2
      camera.right = (metresShown / 2) * widthToHeight
      camera.left = 0 - camera.right
    }
    camera.updateProjectionMatrix()
  }
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(canvas)

  let frames = 0
  const before = new Set<() => void>()
  void renderer.setAnimationLoop(() => {
    for (const fn of [...before]) fn()
    renderer.render(scene, camera)
    frames++
  })

  const world: World = {
    backend: (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend ? 'webgpu' : 'webgl',
    get frames() { return frames },
    three: THREE,
    tsl: TSL,
    renderer, scene, camera, xyz,
    assets: ASSETS,
    shows(metres) {
      if (!(metres > 0) || metres === metresShown) return
      metresShown = metres
      fit()
    },
    eachFrame(fn) {
      before.add(fn)
      return () => { before.delete(fn) }
    },
    close() {
      before.clear()
      observer.disconnect()
      void renderer.setAnimationLoop(null)
      void renderer.dispose()
    },
  }
  return world
}
