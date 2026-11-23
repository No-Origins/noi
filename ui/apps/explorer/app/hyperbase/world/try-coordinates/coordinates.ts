// A TRY, NOT THE PLATFORM (21 Nov 2026, issue 117 in noi-planning). Drawn for the user's brainstorm on the base
// land, to choose how coordinates are SEEN in the world. What the user had decided by then: a square land 200 m
// across, from -100 to 100 each way, with 0, 0 in its middle; one step is one metre; a place is written
// "x 10, y 15", with "z 3" for height (z is up; left out, the thing stands on the ground); a thing stands on its
// place by the middle of its base. How the coordinates are seen is NOT decided: this page shows four ways side by
// side, each switched on and off by a key, so the user can choose. Nothing here is agreed, and the empty stage
// at /world does not use it.
import type { World } from '../world'

/** The land runs from -HALF to HALF each way (the user: a square, 200 m across). */
export const HALF = 100
/** The stronger lines, the numbers on the edges and the upright markers come every this many metres. */
export const MAJOR = 10
/** A marker's words show only while the eye is nearer than this. */
export const NEAR = 45

/** The ONE place the user's coordinates become three.js's: x stays x, the user's y runs along three.js's -z, and
 * the user's z (up) is three.js's y. */
export function toThree(x: number, y: number, z = 0): [number, number, number] {
  return [x, z, -y]
}

/** And back: a point in three.js as the user says it. */
export function fromThree(tx: number, ty: number, tz: number): { x: number; y: number; z: number } {
  return { x: tx, y: -tz, z: ty }
}

/** A number as a place writes it: at most one decimal, and never "-0". */
export function written(n: number): string {
  const r = Math.round(n * 10) / 10
  return String(r === 0 ? 0 : r)
}

/** A place as it is written (the user's word: "x 10, y 15", and "z 3" only when it is off the ground). */
export function place(x: number, y: number, z = 0): string {
  return `x ${written(x)}, y ${written(y)}` + (written(z) === '0' ? '' : `, z ${written(z)}`)
}

/** The whole numbers from -HALF to HALF, every `step`. */
export function marks(step = MAJOR): number[] {
  const out: number[] = []
  for (let v = -HALF; v <= HALF; v += step) out.push(v)
  return out
}

export interface TryLook {
  /** The page's classes for the words on the land. */
  classes: { labels: string; label: string; edge: string; crossing: string; pointer: string }
  /** A colour of Eidos, by its token's name, as the page's style gives it. */
  colour(token: string): string
}

/** The four ways of seeing the coordinates, each with the key that switches it. */
export const WAYS = {
  lines: '1', // lines on the ground: every metre faint, every 10 m stronger, the two axes in colour
  edges: '2', // numbers along the four edges, every 10 m
  markers: '3', // an upright marker at every 10 m crossing, its place in words when the eye is near
  pointer: '4', // the place under the pointer, in words
} as const

/** The views, each with its key. Positions are the user's x, y, z. */
const VIEWS = {
  a: { eye: [0, -150, 120], at: [0, 0, 0] }, // at a slant, from beyond the edge at y -100
  t: { eye: [0, -0.01, 235], at: [0, 0, 0] }, // from straight above
  p: { eye: [0, -30, 1.6], at: [0, -20, 1.4] }, // a person's eyes, standing at x 0, y -30
} as const

/** Puts the try into an open world. Returns what takes it away again. */
export async function openTry(world: World, host: HTMLElement, look: TryLook): Promise<() => void> {
  const THREE = world.three
  const TSL = await import('three/tsl')
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js')
  const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js')
  const { scene, camera } = world
  const canvas = world.renderer.domElement
  const colour = (token: string) => new THREE.Color(look.colour(token) || '#808080')
  const at = (x: number, y: number, z = 0) => new THREE.Vector3(...toThree(x, y, z))
  const gone: Array<{ dispose(): void }> = []

  // THE LAND: one square plane, its lines drawn by the graphics card from where each point is.
  const { Fn, positionWorld, fwidth, fract, abs, min, max, mix, clamp, smoothstep, float, uniform } = TSL
  const land = uniform(colour('--eio-color-world-land'))
  const strong = uniform(colour('--eio-color-world-circle'))
  const faint = uniform(colour('--eio-color-world-land').lerp(colour('--eio-color-world-circle'), 0.45))
  const xAxis = uniform(colour('--eio-color-text-danger'))
  const yAxis = uniform(colour('--eio-color-text-success'))
  const linesOn = uniform(1)
  // 1 on a line every `spacing` metres, 0 a pixel away; lines that would come closer than a few pixels fade out
  const lines = (spacing: number) => {
    const g = positionWorld.xz.div(spacing)
    const w = fwidth(g)
    const d = abs(fract(g.sub(0.5)).sub(0.5)).div(w)
    const on = float(1).sub(min(min(d.x, d.y), 1))
    return on.mul(float(1).sub(smoothstep(0.2, 0.5, max(w.x, w.y)))).mul(linesOn)
  }
  // 1 on a line about two pixels wide where `v` is 0
  const axis = (v: typeof positionWorld.x) => float(1).sub(clamp(abs(v).div(fwidth(v)).sub(0.75), 0, 1)).mul(linesOn)
  const ground = new THREE.MeshBasicNodeMaterial()
  ground.colorNode = Fn(() => {
    const withFaint = mix(land, faint, lines(1))
    const withStrong = mix(withFaint, strong, lines(MAJOR))
    // the user's x axis is where their y is 0 (three.js's z = 0); their y axis is where their x is 0
    const withX = mix(withStrong, xAxis, axis(positionWorld.z))
    return mix(withX, yAxis, axis(positionWorld.x))
  })()
  const plane = new THREE.PlaneGeometry(2 * HALF, 2 * HALF)
  plane.rotateX(-Math.PI / 2)
  const landMesh = new THREE.Mesh(plane, ground)
  scene.add(landMesh)
  gone.push(plane, ground)

  // the edge of the land, always shown
  // (WebGPURenderer draws no LineLoop: the line comes back to its first corner instead)
  const corners = [at(-HALF, -HALF, 0.01), at(HALF, -HALF, 0.01), at(HALF, HALF, 0.01), at(-HALF, HALF, 0.01)]
  const edgeShape = new THREE.BufferGeometry().setFromPoints([...corners, corners[0]!])
  const edgeLine = new THREE.LineBasicNodeMaterial({ color: colour('--eio-color-world-step-edge') })
  scene.add(new THREE.Line(edgeShape, edgeLine))
  gone.push(edgeShape, edgeLine)

  // THE WORDS: drawn by the page (always facing the eye, the same size near and far) over the picture
  const words = new CSS2DRenderer()
  words.domElement.className = look.classes.labels
  host.append(words.domElement)
  const fit = () => words.setSize(host.clientWidth || 1, host.clientHeight || 1)
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(host)
  const label = (text: string, kind: string, p: InstanceType<typeof THREE.Vector3>) => {
    const div = document.createElement('div')
    div.className = `${look.classes.label} ${kind}`
    div.textContent = text
    const o = new CSS2DObject(div)
    o.position.copy(p)
    return o
  }

  // 2 · numbers along the four edges, 4 m outside the land
  const edges = new THREE.Group()
  for (const v of marks()) {
    edges.add(label(`x ${v}`, look.classes.edge, at(v, -HALF - 4)), label(`x ${v}`, look.classes.edge, at(v, HALF + 4)))
    edges.add(label(`y ${v}`, look.classes.edge, at(-HALF - 4, v)), label(`y ${v}`, look.classes.edge, at(HALF + 4, v)))
  }
  scene.add(edges)

  // 3 · an upright marker at every 10 m crossing, 1.2 m tall, standing by the middle of its base
  const markers = new THREE.Group()
  const crossings = marks().flatMap(x => marks().map(y => [x, y] as const))
  const post = new THREE.BoxGeometry(0.2, 1.2, 0.2)
  const postLook = new THREE.MeshBasicNodeMaterial({ color: colour('--eio-color-world-step-edge') })
  const posts = new THREE.InstancedMesh(post, postLook, crossings.length)
  const placing = new THREE.Matrix4()
  crossings.forEach(([x, y], i) => posts.setMatrixAt(i, placing.makeTranslation(at(x, y, 0.6))))
  markers.add(posts)
  const near = crossings.map(([x, y]) => label(place(x, y), look.classes.crossing, at(x, y, 1.5)))
  for (const o of near) markers.add(o)
  scene.add(markers)
  gone.push(post, postLook)

  // 4 · the place under the pointer, in words, and a ring on the ground where it is
  const ringShape = new THREE.RingGeometry(0.25, 0.4, 32)
  ringShape.rotateX(-Math.PI / 2)
  const ringLook = new THREE.MeshBasicNodeMaterial({ color: colour('--eio-color-world-highlight') })
  const ring = new THREE.Mesh(ringShape, ringLook)
  ring.visible = false
  scene.add(ring)
  gone.push(ringShape, ringLook)
  const readout = label('', look.classes.pointer, at(0, 0))
  readout.center.set(-0.12, 1.25) // up and to the right of the point
  readout.visible = false
  scene.add(readout)
  const ray = new THREE.Raycaster()
  const flat = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hit = new THREE.Vector3()
  const pointerOn = { value: true }
  const onMove = (e: PointerEvent) => {
    const r = canvas.getBoundingClientRect()
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera)
    const p = ray.ray.intersectPlane(flat, hit) ? fromThree(hit.x, hit.y, hit.z) : null
    const on = pointerOn.value && p !== null && Math.abs(p.x) <= HALF && Math.abs(p.y) <= HALF
    ring.visible = readout.visible = on
    if (!on || !p) return
    ring.position.copy(at(p.x, p.y, 0.02))
    readout.position.copy(at(p.x, p.y))
    readout.element.textContent = place(p.x, p.y)
  }
  const onLeave = () => { ring.visible = readout.visible = false }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)

  // THE EYE: drag to turn round, scroll to come near, right-drag to slide; a key for each view
  const controls = new OrbitControls(camera, canvas)
  controls.enableDamping = true
  controls.maxPolarAngle = Math.PI / 2 - 0.01
  controls.minDistance = 0.5
  controls.maxDistance = 600
  const view = (v: { eye: readonly number[]; at: readonly number[] }) => {
    camera.position.copy(at(v.eye[0]!, v.eye[1]!, v.eye[2]!))
    controls.target.copy(at(v.at[0]!, v.at[1]!, v.at[2]!))
    controls.update()
  }
  view(VIEWS.a)

  const shown = { lines: true, edges: true, markers: true, pointer: true }
  const onKey = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k in VIEWS) { view(VIEWS[k as keyof typeof VIEWS]); return }
    const way = (Object.keys(WAYS) as Array<keyof typeof WAYS>).find(w => WAYS[w] === k)
    if (!way) return
    shown[way] = !shown[way]
    linesOn.value = shown.lines ? 1 : 0
    edges.visible = shown.edges
    markers.visible = shown.markers
    pointerOn.value = shown.pointer
    if (!shown.pointer) onLeave()
  }
  window.addEventListener('keydown', onKey)

  let frame = requestAnimationFrame(function draw() {
    controls.update()
    // a marker's words only while the eye is near it, so that from far above they do not cover the land
    for (const o of near) o.visible = o.position.distanceTo(camera.position) < NEAR
    words.render(scene, camera)
    frame = requestAnimationFrame(draw)
  })

  // for checks and for tools that take pictures: what this try holds, in the user's own terms
  ;(window as unknown as { __try?: unknown }).__try = { toThree, fromThree, place, shown, view: (k: keyof typeof VIEWS) => view(VIEWS[k]) }

  return () => {
    cancelAnimationFrame(frame)
    window.removeEventListener('keydown', onKey)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    observer.disconnect()
    controls.dispose()
    words.domElement.remove()
    for (const g of gone) g.dispose()
    delete (window as unknown as { __try?: unknown }).__try
  }
}
