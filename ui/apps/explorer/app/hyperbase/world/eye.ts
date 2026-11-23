// THE EYE of a stage (21 Nov 2026): where it is and the place it looks at, said in the user's x, y, z, and moved
// with the mouse (drag to turn round, scroll to come near, right-drag to slide; the brainstorm's pick, not
// agreed). three.js's own mover keeps the eye in three.js's order and outside the stage's `xyz`, so the eye
// crosses HERE, by toThree and fromThree, and whoever uses an eye never sees three.js's order.
//
// A HELD EYE (22 Nov 2026): the land's view is fixed (the user: "fix the default view to isometric view"), so
// the land's eye is held: nothing of the hand moves it. It is put where the land's data says, or glides there.
import { fromThree, toThree, type Place } from './place.ts'
import type { World } from './world.ts'

/** Where an eye is and the place it looks at. */
export interface Sight {
  readonly from: Place
  readonly at: Place
}

export interface Eye {
  /** Where the eye is now. */
  now(): Sight
  /** Puts the eye exactly there; a glide the hand had left ends first. */
  put(sight: Sight): void
  /** Lets the eye go there smoothly over a few moments, and land exactly. */
  glide(sight: Sight): void
  /** Calls `fn` whenever the eye has moved, by the hand or by `put`. Returns what stops it. */
  moved(fn: () => void): () => void
  /** Lets the eye glide on: call before every picture. */
  step(): void
  close(): void
}

/** How long a gliding eye takes to go most of the way, in seconds. MY PICK, not the user's word. */
export const GLIDE = 0.18

/** Opens the eye of a stage. It stays between `nearest` and `farthest` metres from what it looks at. A `held`
 * eye is not moved by the hand: only `put` and `glide` move it. `under` says whether the eye may go under the
 * ground: not where a land lies; yes where one element is looked at alone, so that it can be turned right over
 * (the user, 22 Nov 2026: "I'm unable to rotate the element in all the angles ... I cannot see the bottom of
 * the element"). */
export async function openEye(world: World, nearest: number, farthest: number, held = false, under = false): Promise<Eye> {
  const { OrbitControls } = await import('three/addons/controls/OrbitControls.js')
  const { camera } = world
  const mover = new OrbitControls(camera, world.renderer.domElement)
  mover.enabled = !held
  mover.enableDamping = !held
  mover.maxPolarAngle = under ? Math.PI : Math.PI / 2 - 0.01 // never under the ground, unless it may
  mover.minDistance = nearest
  mover.maxDistance = farthest
  const told = new Set<() => void>()
  let putting = false
  const onMoved = () => { if (!putting) for (const fn of [...told]) fn() }
  mover.addEventListener('change', onMoved)
  const now = (): Sight => ({
    from: fromThree(camera.position.x, camera.position.y, camera.position.z),
    at: fromThree(mover.target.x, mover.target.y, mover.target.z),
  })
  const apart = (a: Place, b: Place, by = 1e-6) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > by
  // where a gliding eye is going, and when it last moved on
  let goal: Sight | null = null
  let last = 0
  return {
    now,
    put(sight) {
      goal = null
      const is = now()
      if (!apart(is.from, sight.from) && !apart(is.at, sight.at)) return
      putting = true
      mover.enableDamping = false
      mover.update()
      camera.position.set(...toThree(sight.from))
      mover.target.set(...toThree(sight.at))
      mover.update()
      mover.enableDamping = !held
      putting = false
      onMoved() // the mover keeps the eye within its bounds: whoever listens is told where it really is
    },
    glide(sight) {
      if (!goal) last = performance.now()
      goal = sight
    },
    moved(fn) {
      told.add(fn)
      return () => { told.delete(fn) }
    },
    step() {
      if (goal) {
        // each moment it covers a share of what is left, so it starts quickly and settles softly; within a
        // millimetre it lands exactly
        const t = performance.now()
        const share = 1 - Math.exp(0 - Math.min((t - last) / 1000, 0.1) / GLIDE)
        last = t
        const is = now()
        const toward = (a: Place, b: Place): Place => ({ x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z + (b.z - a.z) * share })
        const there = !apart(is.from, goal.from, 0.001) && !apart(is.at, goal.at, 0.001)
        const next = there ? goal : { from: toward(is.from, goal.from), at: toward(is.at, goal.at) }
        if (there) goal = null
        camera.position.set(...toThree(next.from))
        mover.target.set(...toThree(next.at))
      }
      mover.update()
    },
    close() {
      told.clear()
      mover.removeEventListener('change', onMoved)
      mover.dispose()
    },
  }
}
