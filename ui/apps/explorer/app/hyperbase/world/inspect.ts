// LOOKING AT ONE ELEMENT (21 Nov 2026, issue 123 in noi-planning). The user: "Every element should have a
// gallery, and when I click the element, show the element in a [modal] in 3D view so that I can inspect the
// element." This puts one element alone on a stage, standing at x 0, y 0, lights it, and gives the stage an eye
// the hand can move. It also takes the still pictures the gallery shows, the same way and from the same sight.
//
// MY PICKS, not the user's word: the light, and where the eye first stands (firstSight); both are the elements' own
// (@noi/eio-3d), drawn with numbers from Eidos.
// One thing only here: a matte thing shows its shape only by how much light each of its faces catches, and a
// colour as dark as the tile's black would show none; so an element whose colour is too dark to show its faces
// is lit more, until its top is shown as a dark grey.
import { ASTROID, BASE_TILE, firstSight, fitsOn, light, lightFor, makeElement, makeMany, reachIn, sizedBy, type Made, type WorldElement } from '@noi/eio-3d'
import { openEye, type Eye, type Sight } from './eye.ts'
import { openWorld, type World } from './world.ts'

export interface InspectLook {
  /** The colour behind the element, as the page's style gives it. */
  background: string
  /** A colour of Eidos, by its token's name, as the page's style gives it. */
  colour(token: string): string
}

/** The narrower of the eye's two angles of view, in degrees: what must hold the whole element. */
function narrowerAngle(world: World): number {
  const camera = world.camera
  if (!('fov' in camera)) throw new Error('One element is looked at by an eye that sees in perspective.')
  const up = camera.fov
  const across = 2 * Math.atan(Math.tan((up / 2) * (Math.PI / 180)) * camera.aspect) * (180 / Math.PI)
  return Math.min(up, across)
}

/** One element on a stage, to be looked at from every side. */
export interface Inspection {
  readonly element: WorldElement
  readonly eye: Eye
  /** Sets another element on this one, where its sockets meet this one's studs (`fitsOn`), to
   * see the two together; `null` takes off what was set on. Says whether something is now set on: not when
   * the piece does not fit. (The user, 22 Nov 2026: "give options in the drone element to select things that
   * can attach to the drone, and then ... show a preview of how it looks like when it's attached.") */
  setOn(piece: WorldElement | null): boolean
  /** Puts the element (`of` 'it') or what is set on it (`of` 'on') in one of its own states, by the state's
   * id (ElementState). When the state has the element reach farther than is in sight, the eye
   * stands back, the way it was looking. Says whether there is such a state. (The user, 22 Nov 2026: "each
   * [element] also have their own set of controls that are specific to them ... we should also cater for those
   * states and features of an element.") */
  state(id: string, of?: 'it' | 'on'): boolean
  /** Gives one of the element's own colours (`of` 'it'), or one of what is set on it (`of` 'on'), another
   * colour to try: by the colour's id (ElementColour) and a role of Eidos by its token's name.
   * Says whether there is such a colour. (The user, 23 Nov 2026: "I want to play with colors on the sides,
   * border, top face, the glass slab.") */
  colour(id: string, token: string, of?: 'it' | 'on'): boolean
  /** Gives one of the element's own settings (`of` 'it'), or one of what is set on it (`of` 'on'), another
   * number: by the setting's id (ElementSetting). A setting is of a size, so the thing is made
   * again in that size, and is at once in the state and the colours it was in. Says whether there is such a
   * setting. (The user, 23 Nov 2026: "Only controls we need are colour, width, breadth and height.") */
  set(id: string, value: number, of?: 'it' | 'on'): boolean
  /** Looks through the element (`of` 'it') or through what is set on it (`of` 'on'), from the place its data
   * says one looks out of it (LookOut); `null` looks from outside again, from where the eye was.
   * While one looks through it, a piece of ground lies under the element, so there is something to see. Says
   * whether one now looks through it. (The user, 23 Nov 2026: "Also add Camera view, I mean, through the
   * camera.") */
  through(of: 'it' | 'on' | null): boolean
  close(): void
}

/** The ground laid under an element while one looks through it: so many base tiles each way from the one the
 * element stands on, with the astroids between them. MY PICK, not the user's word. */
const GROUND_TILES = 2

/** Puts one element alone on an open stage, at x 0, y 0, lit, with an eye the hand can move. */
export async function showElement(world: World, element: WorldElement, look: InspectLook): Promise<Inspection> {
  const dark = light(world, look.colour, lightFor(world, look.colour(element.surface.colour)), true)
  // the thing, and the element as it is shown: in the size chosen for it, when one was
  let made = makeElement(world, element, look.colour)
  let shownAs = element
  world.xyz.add(made.thing)
  const reach = Math.hypot(element.size.x, element.size.y, element.size.z) / 2
  // the element in the largest size that can be chosen for it: the eye must be able to stand back from that
  const largestStep = (along: 'x' | 'y' | 'z') => {
    const steps = (element.settings ?? []).filter(s => s.sets.along === along).flatMap(s => s.steps.map(step => step.value))
    return steps.length > 0 ? Math.max(...steps) : undefined
  }
  const largest = (sizedBy(element, { x: largestStep('x'), y: largestStep('y'), z: largestStep('z') }) ?? element).size
  const reachMost = Math.hypot(largest.x, largest.y, largest.z) / 2
  // how near the hand may come: a tenth of the element's reach; to ground, as near as to one base tile, since
  // what is placed on it is small beside it. How far: twelve times its reach (in its largest size), and never
  // so far that its far end is out of the eye's sight.
  const nearest = (element.ground ? Math.min(reach, BASE_TILE.size.x / 2) : reach) * 0.1
  // an element larger than the eye sees by itself (the Möbius strip, 3 km long, 23 Nov 2026): the eye sees farther
  if ('far' in world.camera && world.camera.far < reachMost * 14) {
    world.camera.far = reachMost * 14
    world.camera.updateProjectionMatrix()
  }
  const farthest = Math.min(reachMost * 12, ('far' in world.camera ? world.camera.far : Infinity) - reachMost)
  // the hand may turn the element right over: this eye may go under it
  const eye = await openEye(world, nearest, farthest, false, true)
  eye.put(firstSight(element, narrowerAngle(world)))
  // what is set on the element, when something is: the thing, the element it is made from, and that element
  // as it is shown (in the size chosen for it, when one was)
  let on: Made | null = null
  let onPiece: WorldElement | null = null
  let onAs: WorldElement | null = null
  // what was chosen for each of the two: its state, the colours tried on it, the sizes chosen for it. A thing
  // made again in another size is given these at once.
  const nothingChosen = () => ({ state: null as string | null, colours: new Map<string, string>(), sizes: {} as { x?: number; y?: number; z?: number } })
  const chosen = { it: nothingChosen(), on: nothingChosen() }
  // LOOKING THROUGH IT: which of the two one looks through (or neither), where the eye was before, how wide it
  // then saw, and the ground laid for the time
  let through: 'it' | 'on' | null = null
  let outside: { sight: Sight; sees: number } | null = null
  let ground: Made[] = []
  const camera = world.camera
  const THREE = world.three
  const [here, ahead] = [new THREE.Vector3(), new THREE.Vector3()]
  /** The sight from a look-out: from its place, toward a point one metre along its low y, both said in the
   * user's x, y, z (the stage's `xyz` turns three.js's own back into them). */
  const sightFrom = (lookOut: NonNullable<Made['lookOut']>): Sight => {
    lookOut.updateWorldMatrix(true, false)
    world.xyz.worldToLocal(lookOut.getWorldPosition(here))
    world.xyz.worldToLocal(lookOut.localToWorld(ahead.set(0, -1, 0)))
    return { from: { x: here.x, y: here.y, z: here.z }, at: { x: ahead.x, y: ahead.y, z: ahead.z } }
  }
  const lookOutOf = (of: 'it' | 'on' | null) => (of === 'it' ? made : of === 'on' ? on : null)?.lookOut ?? null
  const sees = (degrees: number) => { if ('fov' in camera) { camera.fov = degrees; camera.updateProjectionMatrix() } }
  const lookFromOutside = () => {
    if (outside) { sees(outside.sees); eye.put(outside.sight) }
    outside = null
    through = null
    for (const laid of ground) laid.gone()
    ground = []
  }
  /** The eye stands back, the way it looks, until all that `of` reaches in its state `id` is in sight. */
  const standBack = (of: WorldElement, id: string) => {
    const sight = firstSight({ ...of, size: reachIn(of, of.states?.find(s => s.id === id)) }, narrowerAngle(world))
    const need = Math.hypot(sight.from.x - sight.at.x, sight.from.y - sight.at.y, sight.from.z - sight.at.z)
    const now = eye.now()
    const way = { x: now.from.x - now.at.x, y: now.from.y - now.at.y, z: now.from.z - now.at.z }
    const far = Math.hypot(way.x, way.y, way.z)
    if (far < need) eye.glide({ from: { x: now.at.x + (way.x * need) / far, y: now.at.y + (way.y * need) / far, z: now.at.z + (way.z * need) / far }, at: now.at })
  }
  /** The eye goes to what was placed on ground, and stands where it would first stand to see that thing alone. */
  const lookAtPlaced = (piece: WorldElement, place: { x: number; y: number; z: number }) => {
    const sight = firstSight(piece, narrowerAngle(world))
    const there = (p: { x: number; y: number; z: number }) => ({ x: place.x + p.x, y: place.y + p.y, z: place.z + p.z })
    eye.glide({ from: there(sight.from), at: there(sight.at) })
  }
  /** Makes the element shown (`of` 'it'), or what is set on it (`of` 'on'), again in another size. The new
   * thing is at once in the state the one before it was in and in the colours tried on it, and stands where
   * that one stood; what is set on the element goes over to the new thing. */
  const remake = (of: 'it' | 'on', resized: WorldElement) => {
    const next = makeElement(world, resized, look.colour)
    if (chosen[of].state) next.state(chosen[of].state, true)
    for (const [id, token] of chosen[of].colours) next.colour(id, token)
    if (of === 'it') {
      world.xyz.add(next.thing)
      if (on && onAs) {
        const place = fitsOn(onAs, resized)
        if (place) on.thing.position.set(place.x, place.y, place.z)
        next.body.add(on.thing)
      }
      made.gone()
      made = next
      shownAs = resized
      // the eye goes, the way it looks, to where all of the thing is in sight in its new size: farther from a
      // larger one, nearer to a smaller one
      const sight = firstSight({ ...resized, size: reachIn(resized, resized.states?.find(s => s.id === chosen.it.state)) }, narrowerAngle(world))
      const need = Math.hypot(sight.from.x - sight.at.x, sight.from.y - sight.at.y, sight.from.z - sight.at.z)
      const now = eye.now()
      const way = { x: now.from.x - now.at.x, y: now.from.y - now.at.y, z: now.from.z - now.at.z }
      const far = Math.hypot(way.x, way.y, way.z)
      eye.glide({ from: { x: sight.at.x + (way.x * need) / far, y: sight.at.y + (way.y * need) / far, z: sight.at.z + (way.z * need) / far }, at: sight.at })
      return
    }
    const place = fitsOn(resized, shownAs)
    if (!place) { next.gone(); return }
    next.thing.position.set(place.x, place.y, place.z)
    made.body.add(next.thing)
    on?.gone()
    on = next
    onAs = resized
    if (shownAs.ground) lookAtPlaced(resized, place)
  }
  // before every picture: what moves in the element and in what is set on it moves on; then the eye is put
  // where one looks out of it, or glides on as the hand left it
  const stop = world.eachFrame(() => {
    const seconds = performance.now() / 1000
    made.step?.(seconds)
    on?.step?.(seconds)
    const lookOut = lookOutOf(through)
    if (lookOut) eye.put(sightFrom(lookOut))
    else eye.step()
  })
  return {
    element,
    eye,
    setOn(piece) {
      if (through === 'on') lookFromOutside() // what one looked through is taken off
      const had = on !== null
      on?.gone()
      on = null
      onPiece = null
      onAs = null
      chosen.on = nothingChosen() // nothing is chosen yet for what is newly set on
      const place = piece ? fitsOn(piece, shownAs) : null
      if (!piece || !place) {
        // ground with nothing on it any more is looked at whole again
        if (element.ground && had) eye.glide(firstSight(element, narrowerAngle(world)))
        return false
      }
      on = makeElement(world, piece, look.colour)
      onPiece = piece
      onAs = piece
      // the middle of the piece's base goes on the place its sockets and this element's studs give it (or, on
      // ground, the place the ground's data says); it is put into what moves with the element, so it goes
      // where the element goes
      on.thing.position.set(place.x, place.y, place.z)
      made.body.add(on.thing)
      // what is placed on ground is small beside it: the eye goes to it, and stands where it would first
      // stand to see that thing alone
      if (element.ground) lookAtPlaced(piece, place)
      return true
    },
    state(id, of = 'it') {
      if (of === 'on') {
        const done = on?.state(id) ?? false
        if (done) chosen.on.state = id
        // what stands on ground is looked at as an element alone is: the eye stands back for its state
        if (done && element.ground && onAs) standBack(onAs, id)
        return done
      }
      if (!made.state(id)) return false
      chosen.it.state = id
      // the eye stands back, the way it looks, until all the element reaches in this state is in sight
      standBack(shownAs, id)
      return true
    },
    colour(id, token, of = 'it') {
      const done = (of === 'on' ? on : made)?.colour(id, token) ?? false
      if (done) chosen[of].colours.set(id, token)
      return done
    },
    set(id, value, of = 'it') {
      // the element as the gallery knows it, in the size it is made with: its settings say what may be chosen
      const base = of === 'on' ? onPiece : element
      const setting = base?.settings?.find(s => s.id === id)
      if (!base || !setting) return false
      const sizes = chosen[of].sizes
      const along = setting.sets.along
      if ((sizes[along] ?? setting.value) === value) return true // it is that size already
      sizes[along] = value
      const resized = sizedBy(base, sizes)
      if (!resized) return false
      remake(of, resized)
      return true
    },
    through(of) {
      // what the data says of the place one looks out of: the element's own, or that of what is set on it
      const from = of === 'it' ? element.lookOut : of === 'on' ? onPiece?.lookOut : undefined
      if (!of || !from || !lookOutOf(of)) { lookFromOutside(); return false }
      if (!outside) outside = { sight: eye.now(), sees: 'fov' in camera ? camera.fov : from.sees }
      through = of
      sees(from.sees)
      // a piece of ground under the element, its top level with the element's base: base tiles round the one
      // it stands on, and the astroids where four of them meet
      if (ground.length === 0 && !element.ground) {
        const [step, top] = [BASE_TILE.size.x, 0 - BASE_TILE.size.z]
        const span = Array.from({ length: 2 * GROUND_TILES + 1 }, (_, i) => (i - GROUND_TILES) * step)
        const tiles = span.flatMap(x => span.map(y => ({ x, y, z: top })))
        const between = span.slice(1).flatMap(x => span.slice(1).map(y => ({ x: x - step / 2, y: y - step / 2, z: top })))
        ground = [makeMany(world, BASE_TILE, tiles, look.colour), makeMany(world, ASTROID, between, look.colour)]
        for (const laid of ground) world.xyz.add(laid.thing)
      }
      return true
    },
    close() {
      stop()
      eye.close()
      for (const laid of ground) laid.gone()
      on?.gone()
      made.gone()
      dark()
    },
  }
}

/** A still picture of each element, taken on a canvas of the page that is laid out but not shown: the address
 * of each picture, by the element's id. */
export async function picturesOf(elements: readonly WorldElement[], canvas: HTMLCanvasElement, look: InspectLook): Promise<Record<string, string>> {
  const world = await openWorld(canvas, { background: look.background })
  const eye = await openEye(world, 0.01, 100000)
  const pictures: Record<string, string> = {}
  try {
    for (const element of elements) {
      const dark = light(world, look.colour, lightFor(world, look.colour(element.surface.colour)), true)
      const made = makeElement(world, element, look.colour)
      world.xyz.add(made.thing)
      eye.put(firstSight(element, narrowerAngle(world)))
      world.renderer.render(world.scene, world.camera)
      pictures[element.id] = canvas.toDataURL('image/png')
      made.gone()
      dark()
    }
  } finally {
    eye.close()
    world.close()
  }
  return pictures
}
