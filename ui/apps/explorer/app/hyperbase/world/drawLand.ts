// THE PICTURE OF THE LAND (21 Nov 2026, issue 123 in noi-planning). It follows the land's data (land.ts) and
// holds nothing of its own: every change to the land is drawn, and what the hand does on the picture (moving the
// pointer, moving the eye) goes back into the land as a change.
//
// The four ways of seeing the coordinates, as the user kept them ("All four"):
//   lines        on the ground: every metre faint, every 10 m stronger, the two axes in colour (`axes`: the
//                colour of the two axes goes off and on by itself; `metreLines`: so do the lines every metre;
//                `edgeLine`: and the line round the land's edge)
//   edgeNumbers  along the four edges, every 10 m
//   markers      an upright marker at every 10 m crossing, its place in words when the eye is near
//   pointer      the place under the pointer, in words
// And, with the markers (the user, 22 Nov: "pointers for the platform ... the beginning, the end, the left and
// right of the beginning ... just markers, part of the markers"): the name of each of the land's four sides,
// just outside it (`sideNames`).
//
// THE WORDS ARE DRAWN WITH WHAT THE DESIGN SYSTEM ALREADY HAS (the user, 22 Nov: "anything that you're adding,
// any element, you have to first check if it's existing in the design system"; and, asked whether the land's
// other words should use Eidos's parts too: "Yes, those too"). A side's name, an upright marker's place and the
// place under the pointer are each a part of Eidos, drawn by the page: the picture only keeps a spot over the
// place, and tells the page the spots (LandWords.tsx). The numbers along the edges are plain words in a text
// style of Eidos, whose class the page gives.
//
// LAID ON THE LAND (the user, 21 Nov: "Lay them on the land"): the things in the land's data, each drawn from
// its element (makeElement.ts) on its place, in the same light as in the gallery (light.ts). Where things cover
// the ground, the lines and the pointer are on their tops: the coordinates stay seen on what is laid.
//
// Everything is put into the stage's `xyz`, where a position is the user's x, y, z. Only the eye is outside it
// (eye.ts), and it too is said here in the user's x, y, z.
//
// THE VIEW (the user, 22 Nov: "fix the default view to isometric view, and the scroll should basically move the
// world from beginning to end direction"): the eye is held in the sight the land's data says, isometric from
// the start (land.ts, ISOMETRIC); the hand does not turn it. Scrolling names a change to the land, `travel`,
// and the eye glides to where the land then says it is.
//
// CARRIED FROM THE BRAINSTORM'S TRY, NOT AGREED (issue 122, point 5): the colours (Eidos's first-world roles),
// red for the x axis and green for the y axis, the ring under the pointer, and the words lying over the
// picture the same size near and far. (Till 22 Nov the mouse moved the eye: drag to turn round, scroll to come
// near, right-drag to slide. The isometric view took that away.)
// The try's keys are NOT carried: the ways and the eye are changed by code until the user asks for a control.
//
// LAID ON A STRIP (23 Nov 2026, issue 130). The user: "Now let's replace the [high-x] curl platform that we built in
// the world, and also the same markers along with the same effects that they had, and also the elements that we
// placed." So the land can be laid along a strip (`look.strip`, rideAlong.ts): the land's data stays as it is, in
// the strip's own x across and y along, and the picture bends all of it onto the strip. The ground and the sheet
// of marks are bent point by point, each point keeping its flat x and y for the lines; what is laid, the upright
// markers and the ring are put whole on their places, turned as the strip is there; the words stand over their
// bent places. The eye rides along the strip as in the gallery: seen as the flat world is, where it looks. Whatever
// stands more than CLEAR above the strip where the eye looks is cut away, words too, and so are the words far
// along the strip from it.
// MY PICKS, not the user's word: the ground bent every SHEET_STEP metres; the words shown within WORDS_ALONG metres
// along the strip of where the eye looks; the pointer reads the strip's x and y where it meets the ground or the
// tiles' tops.
import type { Object3D } from 'three/webgpu'
import type { WorldElement } from './elements.ts'
import { GLIDE, openEye, type Eye } from './eye.ts'
import { EVERY, edgeNumbers, elementOf, groundTop, highestTop, markerBox, markers, middleOf, pictureHolds, pointerWords, sideNames, slid, topAt, wayInPicture, wordsShown, type Land, type LandState } from './land.ts'
import { light } from './light.ts'
import { makeMany, type Made } from './makeElement.ts'
import { at as placeAt, toThree, type Place } from './place.ts'
import { CLEAR, type Strip } from './rideAlong.ts'
import type { World } from './world.ts'

/** A spot the picture keeps over a place, for the page to draw words into with a part of the design system.
 * `kind` says what the words are: the name of one of the land's sides, the place of an upright marker, or the
 * place under the pointer. The first two carry their words; the pointer's change with the land, which says
 * them (land.ts, `pointerWords`). */
export interface WordSpot {
  readonly kind: 'sideName' | 'markerPlace' | 'pointerPlace'
  /** Which spot it is, among all of them. */
  readonly id: string
  readonly words: string
  readonly spot: HTMLElement
}

export interface LandLook {
  /** The page's classes: for what holds every word on the land, and for a number along an edge (a text style
   * of Eidos, and its colour). */
  classes: { words: string; edgeNumber: string }
  /** A colour of Eidos, by its token's name, as the page's style gives it. */
  colour(token: string): string
  /** The page is told every spot, to draw its words into it with a part of the design system. Told again
   * whenever the spots are made again. */
  spots(spots: readonly WordSpot[]): void
  /** The strip the land is laid along (rideAlong.ts), or none for the flat land. */
  strip?: Strip
}

/** The colours, each a role of Eidos. All the try's picks. */
const COLOURS = {
  land: '--eio-color-world-land',
  strongLine: '--eio-color-world-circle',
  edge: '--eio-color-world-step-edge',
  marker: '--eio-color-world-step-edge',
  xAxis: '--eio-color-text-danger',
  yAxis: '--eio-color-text-success',
  pointer: '--eio-color-world-highlight',
} as const
/** How much of the strong line's colour a faint line has. The try's pick. */
const FAINT = 0.45
/** The ring under the pointer, in metres: its inner and outer reach. The try's pick. */
const RING = [0.25, 0.4] as const
/** How far the eye can be from what it looks at, in metres. The try's pick. */
const EYE_REACH = [0.5, 600] as const
/** How many dots one line of scroll counts for, where a mouse scrolls by lines. The browsers' own habit. */
const DOTS_A_LINE = 16
/** On a strip: how finely the ground is bent, in metres. MY PICK. */
const SHEET_STEP = 5
/** On a strip: words are shown only this far along the strip from where the eye looks, in metres. MY PICK. */
const WORDS_ALONG = 350

/** Draws the land of an open world, and keeps drawing it as it changes. Returns what takes it away again. */
export async function drawLand(world: World, land: Land, host: HTMLElement, look: LandLook): Promise<() => void> {
  const THREE = world.three
  const TSL = await import('three/tsl')
  const { CSS2DRenderer, CSS2DObject } = await import('three/addons/renderers/CSS2DRenderer.js')
  const { xyz, camera } = world
  const canvas = world.renderer.domElement
  const colour = (role: keyof typeof COLOURS) => new THREE.Color(look.colour(COLOURS[role]) || '#808080')
  const strip = look.strip
  /** On a strip: where its place x, y is and its ways there, as a matrix that puts a thing whole on it. */
  const frameMatrix = (x: number, y: number) => {
    const f = strip!.frame(x, y)
    return new THREE.Matrix4().makeBasis(
      new THREE.Vector3(f.across.x, f.across.y, f.across.z), new THREE.Vector3(f.along.x, f.along.y, f.along.z), new THREE.Vector3(f.up.x, f.up.y, f.up.z),
    ).setPosition(f.at.x, f.at.y, f.at.z)
  }
  /** A place as a point inside `xyz`: the user's own order; on a strip, bent onto it (z up from the strip). */
  const point = (p: Place) => {
    if (!strip) return new THREE.Vector3(p.x, p.y, p.z)
    const f = strip.frame(p.x, p.y)
    return new THREE.Vector3(f.at.x + f.up.x * p.z, f.at.y + f.up.y * p.z, f.at.z + f.up.z * p.z)
  }
  const undo: Array<() => void> = []
  const kept = <T extends { dispose(): void }>(made: T): T => { undo.push(() => made.dispose()); return made }
  // on a strip everything is held in one group cut by a plane above where the eye looks
  const cut = new THREE.Plane()
  const holder = strip ? new THREE.ClippingGroup() : xyz
  if (strip) {
    ;(holder as InstanceType<typeof THREE.ClippingGroup>).clippingPlanes = [cut]
    xyz.add(holder)
    undo.push(() => holder.removeFromParent())
  }
  const placed = <T extends Object3D>(thing: T): T => { holder.add(thing); undo.push(() => thing.removeFromParent()); return thing }
  /** A flat sheet as large as the land at height z, its every point keeping its flat x and y (as its uv, which the
   * lines are drawn from); on a strip, bent onto it. */
  const sheet = (s: LandState, z: number) => {
    const middle = middleOf(s)
    const [across, along] = strip ? [Math.max(1, Math.round((2 * s.half) / SHEET_STEP)), Math.max(1, Math.round(s.long / SHEET_STEP))] : [1, 1]
    const g = new THREE.PlaneGeometry(2 * s.half, s.long, across, along).translate(middle.x, middle.y, z)
    const [pos, uv] = [g.getAttribute('position'), g.getAttribute('uv')]
    for (let i = 0; i < pos.count; i++) {
      const [x, y] = [pos.getX(i), pos.getY(i)]
      uv.setXY(i, x, y)
      if (strip) { const b = point({ x, y, z }); pos.setXYZ(i, b.x, b.y, b.z) }
    }
    g.computeBoundingSphere()
    return g
  }

  // THE GROUND: one flat square, its lines drawn by the graphics card from where each point is. A flat shape of
  // three.js lies in x and y, which inside `xyz` is the ground.
  const { Fn, uv, fwidth, fract, abs, min, max, mix, clamp, smoothstep, float, uniform } = TSL
  const here = uv() // the user's x and y of the point being drawn: each sheet keeps them as its uv (`sheet`)
  const linesOn = uniform(land.state.seen.lines ? 1 : 0)
  const axesOn = uniform(land.state.seen.axes ? 1 : 0)
  const metreOn = uniform(land.state.seen.metreLines ? 1 : 0)
  const edgeOn = uniform(land.state.seen.edgeLine ? 1 : 0)
  const halfNow = uniform(land.state.half)
  const halfLongNow = uniform(land.state.long / 2)
  const landColour = uniform(colour('land'))
  const strong = uniform(colour('strongLine'))
  const faint = uniform(colour('land').lerp(colour('strongLine'), FAINT))
  const xAxis = uniform(colour('xAxis'))
  const yAxis = uniform(colour('yAxis'))
  const edgeColour = uniform(colour('edge'))
  // 1 on a line every `every` metres, 0 a dot of the screen away; lines that would come closer than a few dots
  // of the screen fade out
  const lines = (every: number) => {
    const g = here.div(every)
    const w = fwidth(g)
    const d = abs(fract(g.sub(0.5)).sub(0.5)).div(w)
    const on = float(1).sub(min(min(d.x, d.y), 1))
    return on.mul(float(1).sub(smoothstep(0.2, 0.5, max(w.x, w.y)))).mul(linesOn)
  }
  // 1 on a line about two dots of the screen wide where `v` is 0
  const lineAt = (v: typeof here.x) => float(1).sub(clamp(abs(v).div(fwidth(v)).sub(0.75), 0, 1))
  // how strongly each mark shows on the point being drawn
  const everyMetre = lines(1).mul(metreOn) // the lines every metre go off by themselves: the 10 m lines stay
  const everyTen = lines(EVERY)
  // the two axes in colour go off by themselves: the lines along them are then like every other 10 m line
  const onXAxis = lineAt(here.y).mul(axesOn) // the x axis is where y is 0
  const onYAxis = lineAt(here.x).mul(axesOn) // the y axis is where x is 0
  // the line round the edge of the land: where a point has no way left to the nearest side, along x (from
  // x 0, the land's half each way) or along y (from half-way between the beginning's side and the end's)
  const onEdge = lineAt(min(halfNow.sub(abs(here.x)), halfLongNow.sub(abs(here.y.sub(halfLongNow))))).mul(edgeOn)
  const ground = kept(new THREE.MeshBasicNodeMaterial())
  ground.colorNode = Fn(() => {
    const withFaint = mix(landColour, faint, everyMetre)
    const withStrong = mix(withFaint, strong, everyTen)
    // the x axis lies along the beginning's side, on the land's own edge: the axis is drawn over the edge
    const withEdge = mix(withStrong, edgeColour, onEdge)
    const withX = mix(withEdge, xAxis, onXAxis)
    return mix(withX, yAxis, onYAxis)
  })()
  const groundMesh = placed(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), ground))

  // THE SAME MARKS ON THE TOPS OF WHAT IS LAID: a sheet that is nothing but the marks, lying on the tops, so
  // the lines are seen on the tiles as they were on the ground
  const marksOnly = kept(new THREE.MeshBasicNodeMaterial())
  marksOnly.colorNode = Fn(() => mix(mix(mix(mix(faint, strong, everyTen), edgeColour, onEdge), xAxis, onXAxis), yAxis, onYAxis))()
  marksOnly.opacityNode = max(max(everyMetre, everyTen), max(max(onXAxis, onYAxis), onEdge))
  marksOnly.transparent = true
  marksOnly.depthWrite = false
  marksOnly.polygonOffset = true
  marksOnly.polygonOffsetFactor = -2
  marksOnly.polygonOffsetUnits = -2
  const marksOnTops = placed(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), marksOnly))

  // THE LIGHT: plain light, the same as in the gallery
  undo.push(light(world))

  // WHAT IS LAID: every thing in the land's data, the many of one element drawn as one
  let laid: Made[] = []
  const lay = (s: LandState) => {
    for (const made of laid) made.gone()
    laid = []
    // things of one element in one size are drawn as one
    const places = new Map<string, { element: WorldElement; where: Place[] }>()
    for (const thing of s.things) {
      const element = elementOf(thing)
      if (!element) continue
      const kind = `${thing.element} ${JSON.stringify(thing.size ?? {})}`
      const group = places.get(kind) ?? { element, where: [] }
      group.where.push(thing.at)
      places.set(kind, group)
    }
    // on a strip each is put whole on its place, turned as the strip is there
    const onStrip = strip ? (p: Place) => frameMatrix(p.x, p.y) : undefined
    for (const { element, where } of places.values()) {
      const made = makeMany(world, element, where, look.colour, false, onStrip)
      holder.add(made.thing)
      laid.push(made)
    }
    // the sheet of marks lies on the top of the tiles; on a bare land the ground's own marks are enough
    const top = groundTop(s)
    marksOnTops.visible = top > 0
    if (strip) {
      marksOnTops.geometry.dispose()
      marksOnTops.geometry = sheet(s, top)
    } else marksOnTops.position.set(0, 0, top)
  }
  undo.push(() => { for (const made of laid) made.gone() })

  // THE WORDS: lying over the picture, always facing the eye, the same size near and far
  const words = new CSS2DRenderer()
  words.domElement.className = look.classes.words
  host.append(words.domElement)
  undo.push(() => words.domElement.remove())
  // THE PICTURE HOLDS THE LAND FROM ITS LEFT EDGE TO ITS RIGHT (the user, 22 Nov: "zoom out a bit because we
  // are unable to see the edge of left and right"), whatever the window's shape: land.ts says how many metres
  let holds = 0
  const hold = () => {
    holds = pictureHolds(land.state, (host.clientWidth || 1) / (host.clientHeight || 1))
    world.shows(holds)
  }
  const fit = () => { words.setSize(host.clientWidth || 1, host.clientHeight || 1); hold() }
  fit()
  const observer = new ResizeObserver(fit)
  observer.observe(host)
  undo.push(() => observer.disconnect())
  // plain words over a place, in the page's classes: the numbers along the edges
  const word = (text: string, classes: string, p: Place) => {
    const div = document.createElement('div')
    div.className = classes
    div.textContent = text
    const o = new CSS2DObject(div)
    o.position.copy(point(p))
    o.userData.along = p.y
    return o
  }
  // a spot kept over a place, empty: the page draws words into it with a part of the design system
  const spotAt = (p: Place) => {
    const o = new CSS2DObject(document.createElement('div'))
    o.position.copy(point(p))
    o.userData.along = p.y
    return o
  }
  const spotAt_ = new THREE.Vector3()
  // every spot the page draws into: those made with the marks, and the pointer's
  let marked: WordSpot[] = []
  const tell = () => look.spots([...marked, pointerSpot])

  // THE MARKS that follow from the land's size and from the numbers not chosen yet: made again when those change
  const numbers = placed(new THREE.Group())
  const names = placed(new THREE.Group())
  const uprights = placed(new THREE.Group())
  const markerLook = kept(new THREE.MeshBasicNodeMaterial({ color: colour('marker') }))
  let standing: ReturnType<typeof markers> = []
  let standingWords: Array<ReturnType<typeof spotAt>> = []
  let unmark: Array<() => void> = []
  const mark = (s: LandState) => {
    for (const fn of unmark) fn()
    unmark = []
    halfNow.value = s.half
    halfLongNow.value = s.long / 2
    // one flat sheet as large as the land, its middle on the land's middle: so a point of it is a place
    groundMesh.geometry.dispose()
    groundMesh.geometry = sheet(s, 0)
    marksOnTops.geometry.dispose()
    marksOnTops.geometry = sheet(s, strip ? groundTop(s) : 0)
    // the numbers along the four edges
    for (const n of edgeNumbers(s)) numbers.add(word(n.words, look.classes.edgeNumber, n.place))
    // the name of each of the four sides, just outside it: a spot kept over its place
    const named = sideNames(s).map(n => ({ n, kept: spotAt(n.place) }))
    for (const { kept } of named) names.add(kept)
    // an upright marker at every crossing of the stronger lines, the middle of its base on the crossing
    standing = markers(s)
    const first = standing[0]
    if (first) {
      const box = new THREE.BoxGeometry(first.size.x, first.size.y, first.size.z)
      const posts = new THREE.InstancedMesh(box, markerLook, standing.length)
      const put = new THREE.Matrix4()
      standing.forEach((m, i) => {
        const middle = markerBox(m).middle
        posts.setMatrixAt(i, strip ? frameMatrix(middle.x, middle.y).multiply(put.makeTranslation(0, 0, middle.z)) : put.makeTranslation(point(middle)))
      })
      posts.computeBoundingSphere()
      uprights.add(posts)
      unmark.push(() => { box.dispose(); posts.dispose() })
    }
    // each marker's place in words: a spot kept over the marker
    standingWords = standing.map(m => spotAt(m.wordsAt))
    for (const o of standingWords) uprights.add(o)
    unmark.push(() => { numbers.clear(); names.clear(); uprights.clear() })
    marked = [
      ...named.map(({ n, kept }): WordSpot => ({ kind: 'sideName', id: `side ${n.id}`, words: n.words, spot: kept.element })),
      ...standing.map((m, i): WordSpot => ({ kind: 'markerPlace', id: `marker ${m.words}`, words: m.words, spot: standingWords[i]!.element })),
    ]
    tell()
  }
  undo.push(() => { for (const fn of unmark) fn(); groundMesh.geometry.dispose(); marksOnTops.geometry.dispose() })

  // THE POINTER: a ring and the place in words. The ring lies on the ground, or on the top of what is laid
  // there, drawn just over it without leaving it.
  const ringLook = kept(new THREE.MeshBasicNodeMaterial({ color: colour('pointer') }))
  ringLook.polygonOffset = true
  ringLook.polygonOffsetFactor = -4
  ringLook.polygonOffsetUnits = -4
  const ring = placed(new THREE.Mesh(kept(new THREE.RingGeometry(RING[0], RING[1], 32)), ringLook))
  const readout = placed(spotAt({ x: 0, y: 0, z: 0 }))
  readout.center.set(-0.12, 1.25) // up and to the side of the point, clear of the hand
  const pointerSpot: WordSpot = { kind: 'pointerPlace', id: 'pointer', words: '', spot: readout.element }

  // What the picture shows of the state, drawn again after any change
  const show = (s: LandState) => {
    linesOn.value = s.seen.lines ? 1 : 0
    axesOn.value = s.seen.axes ? 1 : 0
    metreOn.value = s.seen.metreLines ? 1 : 0
    edgeOn.value = s.seen.edgeLine ? 1 : 0
    numbers.visible = s.seen.edgeNumbers
    names.visible = s.seen.sideNames
    uprights.visible = s.seen.markers
    const said = pointerWords(s)
    ring.visible = readout.visible = s.seen.pointer && s.pointer !== null && said !== null
    if (s.pointer && said !== null) {
      const onTop = { x: s.pointer.x, y: s.pointer.y, z: topAt(s, s.pointer.x, s.pointer.y) }
      if (strip) {
        ring.matrixAutoUpdate = false
        ring.matrix.copy(frameMatrix(onTop.x, onTop.y).multiply(new THREE.Matrix4().makeTranslation(0, 0, onTop.z)))
      } else ring.position.copy(point(onTop))
      readout.position.copy(point(onTop))
      readout.userData.along = onTop.y
    }
  }

  // THE EYE (eye.ts): held where the land says it is. The hand does not move it; the land's data does.
  const eye = strip ? rideEye() : await openEye(world, EYE_REACH[0], EYE_REACH[1], true)
  undo.push(() => eye.close())

  // THE POINTER'S PLACE: where the line from the eye through the pointer meets what is seen, worked out in
  // `xyz`: the top of what is laid there, or else the ground
  const ray = new THREE.Raycaster()
  const level = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0) // z is up
  const intoXyz = new THREE.Matrix4()
  const met = new THREE.Vector3()
  let hand: { x: number; y: number } | null = null
  const repoint = () => {
    if (!hand) { land.change({ what: 'point', at: null }); return }
    const r = canvas.getBoundingClientRect()
    camera.updateMatrixWorld()
    ray.setFromCamera(new THREE.Vector2(((hand.x - r.left) / r.width) * 2 - 1, -((hand.y - r.top) / r.height) * 2 + 1), camera)
    if (strip) {
      // on a strip: the first sheet the line meets that is not cut away; its uv is the strip's x and y there
      const hit = ray.intersectObjects(marksOnTops.visible ? [marksOnTops, groundMesh] : [groundMesh], false).find(h => cut.distanceToPoint(h.point) >= 0 && h.uv)
      land.change({ what: 'point', at: hit?.uv ? { x: hit.uv.x, y: hit.uv.y, z: 0 } : null })
      return
    }
    ray.ray.applyMatrix4(intoXyz.copy(xyz.matrixWorld).invert())
    const s = land.state
    // first the height of the highest top: if something as high lies there, the pointer is on it
    const top = highestTop(s)
    level.constant = -top
    const high = top > 0 ? ray.ray.intersectPlane(level, met) : null
    if (high && topAt(s, met.x, met.y) >= top) { land.change({ what: 'point', at: { x: met.x, y: met.y, z: 0 } }); return }
    // then the ground's top (the tiles), then the bare ground
    const ground = groundTop(s)
    level.constant = -ground
    const low = ray.ray.intersectPlane(level, met)
    land.change({ what: 'point', at: low ? { x: met.x, y: met.y, z: 0 } : null })
  }
  const onMove = (e: PointerEvent) => { hand = { x: e.clientX, y: e.clientY }; repoint() }
  const onLeave = () => { hand = null; repoint() }
  // THE SCROLL: scrolling on travels toward the end, scrolling back toward the beginning. It names the change
  // to the land; the eye follows the land.
  const onScroll = (e: WheelEvent) => {
    if (e.ctrlKey) return // a pinch is not a scroll
    e.preventDefault()
    const dots = e.deltaY * (e.deltaMode === 1 ? DOTS_A_LINE : e.deltaMode === 2 ? canvas.clientHeight : 1)
    // the world moves in the picture as far as was scrolled, as a page does: one metre of the way is so many
    // dots of the screen
    const dotsAMetre = ((canvas.clientHeight || 1) / holds) * wayInPicture(land.state)
    if (dots !== 0) land.change({ what: 'travel', by: (dots * land.state.picks.scrollGain) / dotsAMetre })
  }
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerleave', onLeave)
  canvas.addEventListener('wheel', onScroll, { passive: false })
  undo.push(() => {
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerleave', onLeave)
    canvas.removeEventListener('wheel', onScroll)
  })
  // the eye moved under a still pointer: another place is under it now
  undo.push(eye.moved(() => { if (hand) repoint() }))

  // the land as it is now, then every change after
  mark(land.state)
  lay(land.state)
  show(land.state)
  eye.put(land.state.eye)
  land.change({ what: 'look', ...eye.now() })
  undo.push(land.watch((now, before) => {
    if (now.half !== before.half || now.long !== before.long || now.picks !== before.picks) mark(now)
    if (now.things !== before.things) lay(now)
    if (now.eye !== before.eye) {
      // a slide (the same way of looking, from as far) is glided through; a new way of looking begins at once
      if (slid(before.eye, now.eye)) eye.glide(now.eye)
      else eye.put(now.eye)
    }
    // what the picture must hold follows the land's width, the margin and the way the eye looks
    if (now.half !== before.half || now.picks.viewMargin !== before.picks.viewMargin || !slid(before.eye, now.eye)) hold()
    show(now)
  }))

  // before every picture: the eye glides on, the markers near the eye show their words, the page lays the words
  undo.push(world.eachFrame(() => {
    eye.step()
    const s = land.state
    standing.forEach((m, i) => { standingWords[i]!.visible = wordsShown(m, s) })
    // on a strip: words far along it from where the eye looks, or cut away above it, are not shown
    if (strip) {
      const near = eye.now().at.y
      const seen = (o: Object3D) => Math.abs((o.userData.along as number) - near) <= WORDS_ALONG && cut.distanceToPoint(o.getWorldPosition(spotAt_)) >= 0
      for (const o of numbers.children) o.visible = seen(o)
      for (const o of names.children) o.visible = seen(o)
      standing.forEach((m, i) => { const o = standingWords[i]!; o.visible = o.visible && seen(o) })
      if (readout.visible) readout.visible = seen(readout)
    }
    words.render(world.scene, camera)
  }))

  return () => { for (const fn of undo.reverse()) fn() }

  /** On a strip: an eye that rides along it (as rideAlong.ts does in the gallery). It takes the land's sight,
   * said flat, and sees it on the strip where it looks: the strip's own across, along and up there; and it cuts
   * away what stands more than CLEAR above the strip there. It glides as the flat world's eye does. */
  function rideEye(): Eye {
    let [shown, goal, last] = [land.state.eye, land.state.eye, performance.now()]
    const told = new Set<() => void>()
    const V = THREE.Vector3
    const see = () => {
      const f = strip!.frame(shown.at.x, shown.at.y)
      const d = { x: shown.from.x - shown.at.x, y: shown.from.y - shown.at.y, z: shown.from.z - shown.at.z }
      const lift = shown.at.z
      const target = { x: f.at.x + f.up.x * lift, y: f.at.y + f.up.y * lift, z: f.at.z + f.up.z * lift }
      const from = {
        x: target.x + f.across.x * d.x + f.along.x * d.y + f.up.x * d.z,
        y: target.y + f.across.y * d.x + f.along.y * d.y + f.up.y * d.z,
        z: target.z + f.across.z * d.x + f.along.z * d.y + f.up.z * d.z,
      }
      const three = (p: { x: number; y: number; z: number }) => new V(...toThree(placeAt(p.x, p.y, p.z)))
      camera.position.copy(three(from))
      const [a, b, up] = [three(from), three(target), three(f.up)]
      const away = a.sub(b).normalize()
      const right = up.clone().cross(away).normalize()
      const top = away.clone().cross(right)
      camera.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, top, away))
      camera.updateMatrixWorld()
      // three.js keeps what lies on the side the plane's normal points to: toward the strip (inside `xyz`'s turn)
      xyz.updateMatrixWorld()
      const inWorld = (p: { x: number; y: number; z: number }) => new V(p.x, p.y, p.z).applyMatrix4(xyz.matrixWorld)
      const high = inWorld({ x: f.at.x + f.up.x * CLEAR, y: f.at.y + f.up.y * CLEAR, z: f.at.z + f.up.z * CLEAR })
      const down = inWorld(f.at).sub(inWorld({ x: f.at.x + f.up.x, y: f.at.y + f.up.y, z: f.at.z + f.up.z })).normalize()
      cut.setFromNormalAndCoplanarPoint(down, high)
      for (const fn of [...told]) fn()
    }
    const mix = (p: Place, q: Place, k: number) => placeAt(p.x + (q.x - p.x) * k, p.y + (q.y - p.y) * k, p.z + (q.z - p.z) * k)
    see()
    return {
      now: () => shown,
      put(sight) { shown = goal = sight; see() },
      glide(sight) { goal = sight },
      moved(fn) { told.add(fn); return () => { told.delete(fn) } },
      step() {
        const t = performance.now()
        const share = 1 - Math.exp(0 - Math.min((t - last) / 1000, 0.1) / GLIDE)
        last = t
        if (shown === goal) return
        const close = Math.hypot(goal.at.x - shown.at.x, goal.at.y - shown.at.y, goal.at.z - shown.at.z) < 0.001
        shown = close ? goal : { from: mix(shown.from, goal.from, share), at: mix(shown.at, goal.at, share) }
        see()
      },
      close() { told.clear() },
    }
  }
}
